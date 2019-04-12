import { DockerServicesManager } from 'service-starter';
import { MongoConnector } from './Modules/MongoConnector';

class CheapDB extends DockerServicesManager {
    constructor() {
        super();

        //注册模块
        this.registerService(new MongoConnector)
    }
}

//启动程序
(new CheapDB).start();