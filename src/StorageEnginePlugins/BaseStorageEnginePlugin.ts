/**
 * 所有存储引擎插件需要实现的接口
 * 
 * 注意：所有存储引擎插件都必须都存放在`StorageEnginePlugins`目录下，并且都必须使用`export =`导出
 */
export interface BaseStorageEnginePlugin {
    /**
     * 存储引擎的名称（必须唯一）
     */
    readonly name: string;

    /**
     * 获取连接。
     */
    getConnection(): Promise<BaseStorageEngineConnection>;
}

/**
 * 存储引擎连接接口
 */
export interface BaseStorageEngineConnection {
    /**
     * 断开连接
     */
    disconnect(): Promise<void>;

    /**
     * 检查连接是否正常，不正常直接抛出异常
     */
    checkConnection(): Promise<void>;

    /**
     * 保存数据
     * @param data 要保存的数据。必须是可序列化的json数据
     */
    set(path: string, data: any): Promise<void>;

    /**
     * 获取数据。数据不存在或读取失败直接抛出异常
     */
    get(path: string): Promise<any>;

    /**
     * 删除数据。没有要删除的数据不会抛出异常
     */
    delete(path: string): Promise<void>;
}