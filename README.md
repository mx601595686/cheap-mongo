# cheap-db
一款低性能数据库，目的是降低数据库存储成本将数据保存在S3等廉价存储介质之上

### 环境变量
* `TZ`：时区，默认 `Asia/Shanghai` (上海)
* `CACHE_SYNC_CRONTAB`：缓存数据同步时间间隔，默认 `*/10 * * * *` (每隔10分钟)
* `MAX_CACHE_SIZE`：缓存最大大小(MB)，默认硬盘总容量的`80%`，最小128MB
* `STORAGE`：存储引擎名称
    * `local`：本地文件存储，数据保存在容器内的`/data/cheap-db`目录下。该存储引擎主要是给测试使用的，生成环境中请不要使用。
    * `spaces`：DigitalOcean Spaces。该存储引擎需要以下配置
        * `ACCESS_KEY`：访问秘钥ID。[在这生成](https://cloud.digitalocean.com/account/api/tokens)
        * `SECRET`：秘钥密码
        * `ENDPOINT`：spaces服务器端点
        * `SPACE_NAME`：要使用的space名称(注意：要使用的space必须事先被建立好)
        * `ENABLE_GZIP`：是否开启Gzip压缩，默认`true`

### VOLUME
* `/data/db`：数据索引列表与缓存数据存放目录。请妥善保管数据。

### EXPORT
* 程序暴露在`80`端口之上，调用时通过`HTTP POST application/x-www-form-urlencoded`

### API
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