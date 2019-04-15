import * as child_process from 'child_process';
import * as mongodb from 'mongodb';
import { BaseServiceModule } from 'service-starter';

import { retryUntil } from '../Tools/RetryUntil';

/**
 * 启动mongodb并建立起连接
 */
export class MongoConnector extends BaseServiceModule {

    private _mongoInstance: child_process.ChildProcess;
    private _mongoConnection: mongodb.MongoClient;
    private _mongoDb: mongodb.Db;
    private _mongoCollection: mongodb.Collection;

    get collection() { return this._mongoCollection };
    get db() { return this._mongoDb };

    async onStart(): Promise<void> {
        //启动mongo
        this._mongoInstance = child_process.spawn('mongod', ['-f', '/etc/mongod.conf']);

        //建立连接
        await retryUntil(async () => {
            this._mongoConnection = await mongodb.connect('mongodb://%2Ftmp%2Fmongodb-27017.sock', { autoReconnect: true, useNewUrlParser: true });
        }, 2000, 5);

        //创建db
        if (!process.env.DBNAME)
            throw new Error('没有设置数据库名称 [环境变量 DBNAME]');
        else
            this._mongoDb = this._mongoConnection.db(process.env.DBNAME);

        //创建collection
        const hasCacheCollection = await this._mongoDb.listCollections({ name: 'cache' }, { nameOnly: true }).toArray();
        if (hasCacheCollection.length === 0) {  //判断collection是否已经创建了
            this._mongoCollection = await this._mongoDb.createCollection('cache', {
                validator: {
                    $jsonSchema: {
                        bsonType: 'object',
                        required: ['_id', 'updateTime', 'syncType', 'hasData'],
                        properties: {
                            _id: {
                                bsonType: 'string',
                                description: '主键'
                            },
                            updateTime: {
                                bsonType: 'date',
                                description: '上次发生变化的时间。可能的情况有：从文件存储引擎读取到数据库，数据被更新或删除'
                            },
                            syncType: {
                                bsonType: 'string',
                                enum: [null, 'update', 'delete'],
                                description: '判断如何同步数据变化，null:没有变化，update:数据被插入或更新，delete:数据被删除'
                            },
                            hasData: {
                                bsonType: 'bool',
                                description: '判断data是否存在'
                            },
                            data: {
                                description: '存储的数据。数据没有缓存在mongo中的时候为没有定义'
                            }
                        }
                    }
                },
                validationAction: 'error',
                validationLevel: 'strict'
            });

            await this._mongoCollection.createIndex({ updateTime: 1, syncType: 1, hasData: 1 }, { background: true });
        } else
            this._mongoCollection = this._mongoDb.collection('cache');
    }

    onStop(): Promise<void> {
        return new Promise(resolve => {
            this._mongoConnection.close(() => {
                this._mongoInstance.once('exit', resolve);
                this._mongoInstance.kill();
            });
            setTimeout(resolve, 5000);  //最多等待5秒
        });
    }

    async onHealthCheck() {
        const status = await this._mongoDb.stats();
        if (typeof status.storageSize !== 'number')
            throw new Error('Mongo数据库健康检查异常');
    }
}