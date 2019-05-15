import * as http from 'http';
import * as koa from 'koa';
import * as koaBody from 'koa-body';
import * as koaRouter from 'koa-router';
import * as _ from 'lodash';
import { BaseServiceModule } from "service-starter";

import { LogicController } from './LogicController';

export class HttpServer extends BaseServiceModule {

    private _httpServer: http.Server;
    private _koaServer: koa;
    private _koaRouter: koaRouter;
    private _logicController: LogicController;

    //注册路由
    private _registerRoute(): void {

        this._koaRouter.post('/set', ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');
            return this._logicController.set(ctx.request.body.key, JSON.parse(ctx.request.body.value));
        });

        this._koaRouter.post('/get', async ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');

            let aggregation;
            if (ctx.request.body.aggregation) {
                aggregation = JSON.parse(ctx.request.body.aggregation);
                if (!Array.isArray(aggregation)) throw new Error('aggregation 必须是一个数组');
            }

            ctx.body = await this._logicController.get(ctx.request.body.key, aggregation);
        });

        this._koaRouter.post('/update', ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');

            const doc = JSON.parse(ctx.request.body.doc);
            if (!_.isPlainObject(doc)) throw new Error('更新文档必须是一个对象');
            return this._logicController.update(ctx.request.body.key, doc);
        });

        this._koaRouter.post('/delete', ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');
            return this._logicController.delete(ctx.request.body.key);
        });

        this._koaRouter.post('/_syncData', () => {  //立即开始同步数据
            this._logicController._syncData();
        });

        this._koaRouter.post('/_test', ctx => {  //主要是给客户端测试连接使用的
            ctx.body = 'cheap-db ok';
        });
    }

    onStart(): Promise<void> {
        return new Promise(resolve => {
            this._logicController = this.services.LogicController;

            this._koaServer = new koa();
            this._koaRouter = new koaRouter();

            this._registerRoute();

            this._koaServer.use(koaBody({
                json: false,
                jsonLimit: 1, //不能设置为0，否则无效
                text: false,
                textLimit: 1,
                formLimit: '17mb',
                multipart: false,
            }));

            this._koaServer.use(async (ctx, next) => {
                try {
                    if (ctx.request.method === 'POST') {
                        await next();
                        if (ctx.body === undefined) ctx.body = 'ok';
                    } else
                        ctx.status = 405;   //Method Not Allowd
                } catch (err) {
                    ctx.status = err.statusCode || err.status || 400;
                    ctx.body = err.message;
                }
            });

            this._koaServer.use(this._koaRouter.routes()).use(this._koaRouter.allowedMethods());

            this._httpServer = http.createServer(this._koaServer.callback()).listen(80, resolve);
        });
    }

    onStop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._httpServer.close(e => e ? reject(e) : resolve());
            setTimeout(resolve, 5000);  //最多等待5秒
        });
    }
}