FROM node:11-stretch

# 下面这一段是从mongo官方镜像中复制的(https://github.com/docker-library/mongo/blob/757cedc326/4.0/Dockerfile)
RUN set -eux; \
	apt-get update; \
	apt-get install -y --no-install-recommends \
		ca-certificates \
		jq \
		numactl \
	; \
	if ! command -v ps > /dev/null; then \
		apt-get install -y --no-install-recommends procps; \
	fi; \
	rm -rf /var/lib/apt/lists/*

# grab gosu for easy step-down from root (https://github.com/tianon/gosu/releases)
ENV GOSU_VERSION 1.11
# grab "js-yaml" for parsing mongod's YAML config files (https://github.com/nodeca/js-yaml/releases)
ENV JSYAML_VERSION 3.13.0

RUN set -ex; \
	\
	apt-get update; \
	apt-get install -y --no-install-recommends \
		wget \
	; \
	if ! command -v gpg > /dev/null; then \
		apt-get install -y --no-install-recommends gnupg dirmngr; \
	fi; \
	rm -rf /var/lib/apt/lists/*; \
	\
	dpkgArch="$(dpkg --print-architecture | awk -F- '{ print $NF }')"; \
	wget -O /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$dpkgArch"; \
	wget -O /usr/local/bin/gosu.asc "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$dpkgArch.asc"; \
	export GNUPGHOME="$(mktemp -d)"; \
	gpg --batch --keyserver ha.pool.sks-keyservers.net --recv-keys B42F6819007F00F88E364FD4036A9C25BF357DD4; \
	gpg --batch --verify /usr/local/bin/gosu.asc /usr/local/bin/gosu; \
	command -v gpgconf && gpgconf --kill all || :; \
	rm -r "$GNUPGHOME" /usr/local/bin/gosu.asc; \
	chmod +x /usr/local/bin/gosu; \
	gosu --version; \
	gosu nobody true; \
	\
	wget -O /js-yaml.js "https://github.com/nodeca/js-yaml/raw/${JSYAML_VERSION}/dist/js-yaml.js"; \
# TODO some sort of download verification here
	\
	apt-get purge -y --auto-remove wget

ENV GPG_KEYS 9DA31620334BD75D9DCB49F368818C72E52529D4
RUN set -ex; \
	export GNUPGHOME="$(mktemp -d)"; \
	for key in $GPG_KEYS; do \
		gpg --batch --keyserver ha.pool.sks-keyservers.net --recv-keys "$key"; \
	done; \
	gpg --batch --export $GPG_KEYS > /etc/apt/trusted.gpg.d/mongodb.gpg; \
	command -v gpgconf && gpgconf --kill all || :; \
	rm -r "$GNUPGHOME"; \
	apt-key list

# 当前node镜像所使用的Debian版本
# Mongodb的主版本号
ENV DEBIAN_VERSION=stretch MONGO_VERSION=4.0
RUN echo "deb http://repo.mongodb.org/apt/debian ${DEBIAN_VERSION}/mongodb-org/${MONGO_VERSION} main" | tee /etc/apt/sources.list.d/mongodb-org-${MONGO_VERSION}.list

# 接下来是我的配置项目
RUN apt-get update && apt-get install -y --no-install-recommends \
    mongodb-org \
    dos2unix \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# TZ：时区默认是上海
ENV TZ=Asia/Shanghai

WORKDIR /app

# 复制代码
COPY ["src", "/app/src/"]
COPY ["package.json", "gulpfile.js", "tsconfig.json", "LICENSE", "/app/"]
COPY [".bashrc", "/root/.bashrc"]
COPY ["mongod.conf", "/etc/mongod.conf"]

VOLUME "/var/lib/mongodb"

# 编译
RUN npm install && \ 
    npm run compile && \
# 清除devDependencies包
    npm prune --production && \
# 删除多余文件
    rm -r src gulpfile.js tsconfig.json && \
# 确保程序代码不会被破坏
    chmod 755 /app && \
# 确保可执行
    dos2unix node_modules/service-starter/src/Docker/health_check.sh /root/.bashrc && \
    chmod 755 node_modules/service-starter/src/Docker/health_check.sh

HEALTHCHECK \
    # 每次检查的间隔时间
    --interval=1m \
    # 单次检查的超时时长
    --timeout=30s \
    # 这个可以理解为在开始正式检查之前容器所需要的启动时间
    --start-period=1m \
    # 连续多少次检查失败可判定该服务是unhealthy
    --retries=3 \
    # 调用程序所暴露出的健康检查接口(要使用绝对路径)
    CMD /app/node_modules/service-starter/src/Docker/health_check.sh

# 默认数据库名称
ENV DBNAME "defualt"
# 数据同步时间间隔，默认每10分钟
ENV SYNC_CRONTAB "*/10 * * * *"

EXPOSE 80

CMD ["node", "."]