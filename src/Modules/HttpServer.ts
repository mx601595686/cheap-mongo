import * as http from 'http';
import * as koa from 'koa';
import * as koaBody from 'koa-body';
import * as koaRouter from 'koa-router';
import * as HttpError from 'http-errors';
import * as _ from 'lodash';
import * as randomString from 'crypto-random-string';
import { BaseServiceModule } from "service-starter";
import log from 'log-formatter';

import { LogicController } from './LogicController';

export class HttpServer extends BaseServiceModule {

    private _httpServer: http.Server;
    private _logicController: LogicController;

    //用于保存用户访问令牌数据，排在前面的是新令牌，每隔5分钟更新一次令牌，每个令牌最长有效期10分钟
    private readonly _tokens: [string, string] = [randomString({ length: 32 }), randomString({ length: 32 })];
    private _updateTokenTimer: NodeJS.Timer;

    //注册路由
    private _registerRoute(notLogged: koaRouter, logged: koaRouter): void {
        notLogged.post('/login', ctx => {  //登陆获取令牌
            if (ctx.request.body.password === process.env.PASSWORD) {
                ctx.body = this._tokens[0];
                log('数据库登陆：', ctx.request.ip);
            } else {
                log.error.text.round.red.text.red('登陆失败', `IP："${ctx.request.ip}"`, `使用的密码："${ctx.request.body.password}"`);
                throw new HttpError.BadRequest();
            }
        });

        logged.post('/updateToken', ctx => {  //更新令牌
            ctx.body = this._tokens[0];
        });

        logged.post('/test', ctx => {  //主要是给客户端测试连接使用的
            ctx.body = 'cheap-db ok';
        });

        logged.post('/set', ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');
            return this._logicController.set(ctx.request.body.key, JSON.parse(ctx.request.body.value));
        });

        logged.post('/get', async ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');

            let aggregation;
            if (ctx.request.body.aggregation) {
                aggregation = JSON.parse(ctx.request.body.aggregation);
                if (!Array.isArray(aggregation)) throw new Error('aggregation 必须是一个数组');
            }

            ctx.body = await this._logicController.get(ctx.request.body.key, aggregation);
        });

        logged.post('/update', ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');

            const doc = JSON.parse(ctx.request.body.doc);
            if (!_.isPlainObject(doc)) throw new Error('更新文档必须是一个对象');
            return this._logicController.update(ctx.request.body.key, doc);
        });

        logged.post('/delete', ctx => {
            if (!ctx.request.body.key) throw new Error('key 不可以为空');
            return this._logicController.delete(ctx.request.body.key);
        });

        logged.post('/syncData', () => {
            this._logicController._syncData();
        });

        logged.post('/migrate', ctx => {
            if (!ctx.request.body.target) throw new Error('target 不可以为空');
            if (!ctx.request.body.password) throw new Error('password 不可以为空');
            this._logicController.migrate(ctx.request.body.target, ctx.request.body.password);
        });

        logged.post('/fillCache', () => {
            this._logicController.fillCache();
        });
    }

    onStart(): Promise<void> {
        return new Promise(resolve => {
            this._logicController = this.services.LogicController;

            if (!process.env.PASSWORD)
                throw new Error('没有设置数据库密码 [环境变量 PASSWORD]');

            this._updateTokenTimer = setInterval(() => {
                this._tokens.pop();
                this._tokens.unshift(randomString({ length: 32 }));
            }, 5 * 60 * 1000);

            const koaServer = new koa();
            const notLogged = new koaRouter();
            const logged = new koaRouter();

            this._registerRoute(notLogged, logged);

            koaServer.use(koaBody({
                json: false,
                jsonLimit: 1, //不能设置为0，否则无效
                text: false,
                textLimit: 1,
                formLimit: '17mb',
                multipart: false,
            }));

            koaServer.use(async (ctx, next) => {
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

            notLogged.use((ctx, next) => {
                if (this._tokens.includes(ctx.request.body.token))
                    return next();
                else
                    throw new HttpError.Unauthorized();
            }, logged.routes(), logged.allowedMethods());
            koaServer.use(notLogged.routes()).use(notLogged.allowedMethods());

            this._httpServer = http.createServer(koaServer.callback()).listen(80, resolve);
        });
    }

    onStop(): Promise<void> {
        return new Promise((resolve, reject) => {
            clearInterval(this._updateTokenTimer);
            this._httpServer.close(e => e ? reject(e) : resolve());
            setTimeout(resolve, 5000);  //最多等待5秒
        });
    }
}