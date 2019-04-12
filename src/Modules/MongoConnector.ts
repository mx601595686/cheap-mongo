import * as child_process from 'child_process';
import * as mongodb from 'mongodb';
import { BaseServiceModule } from "service-starter";

import { retryUntil } from '../Tools/RetryUntil';

/**
 * 启动mongodb并建立起连接
 */
export class MongoConnector extends BaseServiceModule {

    private _mongoInstance: child_process.ChildProcess;

    /**
     * 数据库连接
     */
    connection: mongodb.MongoClient;

    async onStart(): Promise<void> {
        this._mongoInstance = child_process.spawn('mongod', ['-f', '/etc/mongod.conf']);
        await retryUntil(async () => {
            this.connection = await mongodb.connect('mongodb://%2Ftmp%2Fmongodb-27017.sock', { autoReconnect: true });
        }, 2000, 5);
    }

    onStop(): Promise<void> {
        return new Promise(resolve => {
            this.connection.close(() => {
                this._mongoInstance.once('exit', resolve);
                this._mongoInstance.kill();
            });
            setTimeout(resolve, 5000);  //最多等待5秒
        });
    }

    async onHealthCheck() {
        if (!this.connection.isConnected())
            throw new Error('数据库连接断开');
    }
}