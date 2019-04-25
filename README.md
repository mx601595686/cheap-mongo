# cheap-db
一款低性能数据库，目的是降低数据库存储成本将数据保存在Amazon S3等廉价存储服务之上

### 环境变量
* `TZ`：时区，默认 `Asia/Shanghai` (上海)
* `DBNAME`：数据库名称，默认 `default`
* `CACHE_SYNC_CRONTAB`：缓存数据同步时间间隔，默认 `*/10 * * * *` (每隔10分钟)
* `MAX_CACHE_SIZE`：缓存最大大小(bytes)，默认硬盘总容量的80%，最小128MB
* `STORAGE`：存储引擎名称
    * `local`：本地文件存储，数据保存在 `/data/cheap-db`。该存储引擎主要是给测试使用的，生成环境中请不要使用。
    * `xxx`：

### VOLUME
* `/data/db`：缓存数据存放目录。请妥善保管缓存，避免因为缓存没有同步而导致某些数据丢失的情况。

### API
> 接口调用方法：HTTP POST application/x-www-form-urlencoded

* `/set`：设置或覆盖数据
    * `key`：键名。注意：如果使用的是文件存储引擎，则key不应当包含文件系统不允许的特殊字符
    * `value`：值。注意：value 必须是可序列化的 json 数据
* `/get`：获取数据。没有数据会抛出异常
    * `key`：键名
    * `[aggregation]`：[mongodb聚合方法](https://docs.mongodb.com/manual/reference/aggregation/)
* `/update`：更新数据，没有找到要修改的数据会抛出异常
    * `key`：键名
    * `doc`：[mongodb更新操作文档](https://docs.mongodb.com/manual/reference/operator/update/)
* `/delete`：删除数据
    * `key`：键名
* `/_syncData`：立即同步缓存数据
* `/_test`：测试数据库连接是否正常。正常返回 `"cheap-db ok"`