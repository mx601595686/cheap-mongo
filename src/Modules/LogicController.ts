import * as _ from 'lodash';
import * as mongodb from 'mongodb';
import * as schedule from 'node-schedule';
import log from 'log-formatter';
import { BaseServiceModule } from "service-starter";

import { retryUntil } from '../Tools/RetryUntil';
import { MongoConnector } from "./MongoConnector";
import { StorageEngineConnector } from "./StorageEngineConnector";
import { BaseStorageEngineConnection } from "../StorageEnginePlugins/BaseStorageEnginePlugin";

/**
 * 存储逻辑控制器
 */
export class LogicController extends BaseServiceModule {

    private _mongoDb: mongodb.Db;
    private _mongoCollection: mongodb.Collection;
    private _storageConnection: BaseStorageEngineConnection;

    private _isCleaning = false;        //是否正在清理
    private _isSynchronizing = false;   //是否正在同步
    private _cleanTimer: NodeJS.Timer;
    private _syncTimer: schedule.Job;
    private _maxCacheSize: number;   //最大缓存大小（mongo数据库大小）

    async onStart(): Promise<void> {
        this._mongoDb = (this.services.MongoConnector as MongoConnector).db;
        this._mongoCollection = (this.services.MongoConnector as MongoConnector).collection;
        this._storageConnection = (this.services.StorageEngineConnector as StorageEngineConnector).connection;

        this._syncTimer = schedule.scheduleJob(process.env.CACHE_SYNC_CRONTAB || "*/10 * * * *", this._syncData.bind(this));

        if (process.env.MAX_CACHE_SIZE && /^\d+$/.test(process.env.MAX_CACHE_SIZE))
            this._maxCacheSize = Math.max(+process.env.MAX_CACHE_SIZE, 128) * 1024 * 1024;
        else {
            const status = await this._mongoDb.stats();
            this._maxCacheSize = Math.trunc(status.fsTotalSize * 0.8);
        }

        this._cleanTimer = setInterval(this._cleanCache.bind(this), 1 * 60 * 1000);
    }

    onStop(): Promise<void> {
        return new Promise(resolve => {
            clearInterval(this._cleanTimer);
            this._syncTimer.cancel();

            //等待同步或清理执行完成
            const timer = setInterval(() => {
                if (this._isCleaning === false && this._isSynchronizing === false) {
                    resolve();
                    clearInterval(timer);
                }
            }, 1000);
        });
    }

    /**
     * 清理数据库缓存
     */
    async _cleanCache(): Promise<void> {
        if (!this._isCleaning) {
            try {
                this._isCleaning = true;

                const status = await this._mongoDb.stats();
                if (status.dataSize + status.indexSize > this._maxCacheSize) {
                    log.text.cyan('开始清理缓存');

                    const deleteItems = await this._mongoCollection.find({ hasData: true, syncType: null }, {
                        sort: { updateTime: 1 },
                        limit: Math.trunc(this._maxCacheSize * 0.1 / status.avgObjSize),   //估算一下大约要删掉多少个文档
                        projection: { _id: 1 }
                    }).toArray();

                    if (deleteItems.length > 0) {
                        await this._mongoCollection.bulkWrite(deleteItems.map(item => ({
                            updateOne: {
                                filter: { _id: item._id, syncType: null },
                                update: { $set: { hasData: false }, $unset: { data: "" } }
                            }
                        })));
                    }

                    log.text.green('清理缓存完成');
                }
            } catch (error) {
                log.error.red.content.red('清理缓存异常：', error);
            } finally {
                this._isCleaning = false;
            }
        }
    }

    /**
     * 同步数据库中的修改
     */
    async _syncData(): Promise<void> {
        if (!this._isSynchronizing) {
            try {
                log.text.cyan('开始同步数据变化');
                this._isSynchronizing = true;

                const syncItems = await this._mongoCollection.find({ syncType: { $ne: null } }, { projection: { _id: 1, syncType: 1 } }).toArray();
                for (const item of syncItems) {
                    if (item.syncType === 'update') {
                        const result = await this._mongoCollection.findOneAndUpdate(item, { $set: { syncType: null } }, { projection: { data: 1, _id: 0 } });
                        if (result.value != null) {
                            try {
                                await this._storageConnection.set(item._id, result.value.data);
                            } catch (error) {
                                try {
                                    //把保存失败的数据重新恢复到mongo
                                    await retryUntil(() => this._mongoCollection.updateOne({ _id: item._id, syncType: null }, { $set: { syncType: 'update', data: result.value.data } }), 2000, 3);
                                } catch (error) {
                                    log.error.location.red.text.red.content.content.red('恢复失败', '无法将保存失败的数据重新恢复到mongo', result.value, error);
                                }

                                throw error;
                            }
                        }
                    } else {
                        await this._storageConnection.delete(item._id);
                        await this._mongoCollection.deleteOne(item);
                    }
                }

                log.text.green('同步数据变化完成');
            } catch (error) {
                log.error.red.content.red('同步数据变化异常：', error);
            } finally {
                this._isSynchronizing = false;
            }
        }
    }

    /**
     * 设置或覆盖数据。
     * 注意：value必须是可序列化的json数据
     */
    async set(key: string, value: any): Promise<void> {
        await this._mongoCollection.replaceOne({ _id: key }, { updateTime: new Date, syncType: 'update', hasData: true, data: value }, { upsert: true });
    }

    /**
     * 获取数据。没有数据会抛出异常
     * @param aggregation [mongo的聚合方法](https://docs.mongodb.com/manual/reference/aggregation/)
     */
    async get(key: string, aggregation?: any[]): Promise<any[]> {
        const hasAggregation = aggregation != null && aggregation.length > 0;

        if (hasAggregation && '$out' in (aggregation as any)[(aggregation as any).length - 1])
            throw new Error("聚合不允许使用 '$out' stage");

        const isExist = await this._mongoCollection.findOne({ _id: key, syncType: { $ne: 'delete' } }, { projection: { hasData: 1, _id: 0 } });

        if (isExist == null)
            throw new Error(`没有找到对应的数据。[key: ${key}]`);
        else if (!isExist.hasData) { //如果数据库中没有缓存就从存储引擎中读取
            const data = await this._storageConnection.get(key);
            await this._mongoCollection.replaceOne({ _id: key, syncType: null }, { updateTime: new Date, syncType: null, hasData: true, data });
            if (!hasAggregation) return [data];   //如果没有聚合操作就直接返回
        }

        //执行聚合查询操作
        const pipeline = [
            { $match: { _id: key } },
            { $replaceRoot: { newRoot: "$data" } },
        ];
        if (hasAggregation) pipeline.push(...(aggregation as any));
        return this._mongoCollection.aggregate(pipeline).toArray();
    }

    /**
     * 更新数据，没有找到要修改的数据会抛出异常
     * @param doc [mongodb更新操作文档](https://docs.mongodb.com/manual/reference/operator/update/)
     */
    async update(key: string, doc: any): Promise<void> {
        if (_.isEmpty(doc)) throw new Error('更新操作文档不可以为空');

        const isExist = await this._mongoCollection.findOne({ _id: key, syncType: { $ne: 'delete' } }, { projection: { hasData: 1, _id: 0 } });

        if (isExist == null)
            throw new Error(`没有找到对应的数据。[key: ${key}]`);
        else if (!isExist.hasData) { //如果数据库中没有缓存就从存储引擎中读取
            const data = await this._storageConnection.get(key);
            await this._mongoCollection.replaceOne({ _id: key, syncType: null }, { updateTime: new Date, syncType: null, hasData: true, data });
        }

        //为更新文档中的所有属性名前面添加'data.'
        _.forEach(doc, (items, key) => { doc[key] = _.fromPairs(_.map(items, (value, key) => ['data.' + key, value])) });

        _.set(doc, ['$set', 'updateTime'], new Date);
        _.set(doc, ['$set', 'syncType'], 'update');
        await this._mongoCollection.updateOne({ _id: key, syncType: { $ne: 'delete' } }, doc);
    }

    /**
     * 删除数据
     */
    async delete(key: string): Promise<void> {
        await this._mongoCollection.updateOne({ _id: key, syncType: { $ne: 'delete' } }, {
            $set: { updateTime: new Date, syncType: 'delete', hasData: false },
            $unset: { data: "" }
        });
    }
}