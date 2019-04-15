import { DockerServicesManager } from 'service-starter';

import { MongoConnector } from './Modules/MongoConnector';
import { StorageEngineConnector } from './Modules/StorageEngineConnector';
import { LogicController } from './Modules/LogicController';
import { HttpServer } from './Modules/HttpServer';

class CheapDB extends DockerServicesManager {
    constructor() {
        super();

        //注册模块
        this.registerService(new MongoConnector)
        this.registerService(new StorageEngineConnector)
        this.registerService(new LogicController)
        this.registerService(new HttpServer)
    }
}

//启动程序
(new CheapDB).start();