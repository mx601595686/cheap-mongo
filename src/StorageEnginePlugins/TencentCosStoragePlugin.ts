import * as zlib from 'zlib';
import PQueue from 'p-queue';
const COS = require('cos-nodejs-sdk-v5');

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

/**
 * 由于腾讯COS返回的不是标准的JS Error类型对象，通过该方法进行校正
 */
function changeErrorType(err: { error: any }): Error {
    if (typeof err.error === 'string')
        return new Error(err.error);
    else
        return err.error;
}

export = class TencentCosStoragePlugin implements BaseStorageEnginePlugin {

    get name() { return 'cos' }

    async getConnection(): Promise<BaseStorageEngineConnection> {
        const pQueue = new PQueue({ interval: 1000, intervalCap: 1000 });    //速度限制。按照腾讯的要求最多每秒1000个请求
        const enableGzip = (process.env.ENABLE_GZIP || '').toLowerCase() === 'false' ? false : true;    //是否开启gzip压缩，默认true
        const cos = new COS({
            SecretId: process.env.SECRET_ID,
            SecretKey: process.env.SECRET_KEY,
            FileParallelLimit: 999,
            ChunkParallelLimit: 999,
            ChunkSize: 1024 * 1024 * 10,
        });

        const connection: BaseStorageEngineConnection = {
            disconnect() {
                return pQueue.onIdle();
            },
            checkConnection() {
                return pQueue.add(() => new Promise((resolve, reject) => {
                    cos.headBucket({
                        Bucket: process.env.BUCKET,
                        Region: process.env.REGION
                    }, function (err: any, data: any) {
                        if (err)
                            reject(changeErrorType(err));
                        else {
                            resolve();
                        }
                    });
                }));
            },
            set(path: string, data: any) {
                return pQueue.add(async () => {
                  /*   await spaces.putObject({
                        Bucket: process.env.SPACE_NAME as string,
                        Key: path,
                        ContentEncoding: enableGzip ? 'gzip' : undefined,
                        ContentType: 'application/json',
                        Body: enableGzip ? await gzip(JSON.stringify(data)) : JSON.stringify(data)
                    }).promise(); */
                });
            },
            get(path: string) {
                return pQueue.add(async () => {
                  /*   const result = await spaces.getObject({ Bucket: process.env.SPACE_NAME as string, Key: path }).promise()
                        .catch((e: aws.AWSError) => { if (!e.message) e.message = e.code; throw e });

                    if (result.ContentEncoding === 'gzip')
                        return JSON.parse((await gunzip(result.Body as Buffer)).toString());
                    else
                        return JSON.parse((result.Body as Buffer).toString()); */
                }, { priority: 1 });
            },
            async delete(path: string) {
                //await pQueue.add(() => spaces.deleteObject({ Bucket: process.env.SPACE_NAME as string, Key: path }).promise());
            }
        };

        await connection.checkConnection();
        return connection;
    }
}