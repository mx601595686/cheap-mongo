import * as zlib from 'zlib';
import * as aws from 'aws-sdk';
import * as PQueue from 'p-queue';

import { BaseStorageEnginePlugin, BaseStorageEngineConnection } from "./BaseStorageEnginePlugin";

function gzip(data: zlib.InputType): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        zlib.gzip(data, { chunkSize: 1024, memLevel: 9, level: 9 }, (e, d) => e ? reject(e) : resolve(d));
    });
}

function gunzip(data: zlib.InputType): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        zlib.gunzip(data, (e, d) => e ? reject(e) : resolve(d));
    });
}

export = class DigitalOceanSpacesStoragePlugin implements BaseStorageEnginePlugin {

    get name() { return 'spaces' }

    async getConnection(): Promise<BaseStorageEngineConnection> {
        const pQueue = new PQueue({ interval: 1000, intervalCap: 200 });    //速度限制。按照digital ocean的要求最多每秒200个请求
        const enableGzip = (process.env.ENABLE_GZIP || '').toLowerCase() === 'false' ? false : true;    //是否开启gzip压缩，默认true
        const spaces = new aws.S3({
            endpoint: `https://${process.env.ENDPOINT}`,
            accessKeyId: process.env.ACCESS_KEY,
            secretAccessKey: process.env.SECRET,
            maxRetries: 5,
            retryDelayOptions: { base: 100 }
        });

        const connection: BaseStorageEngineConnection = {
            disconnect() {
                return pQueue.onIdle();
            },
            async checkConnection() {
                const result = await pQueue.add(() => spaces.getBucketLocation({ Bucket: process.env.SPACE_NAME as string }).promise());
                if (typeof result.LocationConstraint !== 'string') throw new Error('DigitalOcean Spaces Storage 连接异常');
            },
            set(path: string, data: any) {
                return pQueue.add(async () => {
                    await spaces.putObject({
                        Bucket: process.env.SPACE_NAME as string,
                        Key: path,
                        ContentEncoding: enableGzip ? 'gzip' : undefined,
                        ContentType: 'application/json',
                        Body: enableGzip ? await gzip(JSON.stringify(data)) : JSON.stringify(data)
                    }).promise();
                });
            },
            get(path: string) {
                return pQueue.add(async () => {
                    const result = await spaces.getObject({ Bucket: process.env.SPACE_NAME as string, Key: path }).promise()
                        .catch((e: aws.AWSError) => { if (!e.message) e.message = e.code; throw e });

                    if (result.ContentEncoding === 'gzip')
                        return JSON.parse((await gunzip(result.Body as Buffer)).toString());
                    else
                        return JSON.parse((result.Body as Buffer).toString());
                }, { priority: 1 });
            },
            async delete(path: string) {
                await pQueue.add(() => spaces.deleteObject({ Bucket: process.env.SPACE_NAME as string, Key: path }).promise());
            }
        };

        await connection.checkConnection();
        return connection;
    }
}