/**
 * MQTT客户端封装
 * 使用全局 mqtt 对象（从CDN加载）
 */
class MQTTClient {
    constructor(config) {
        this.config = {
            host: config.host || 'broker.hivemq.com',
            port: config.port || 8884,
            clientId: config.clientId || `web_${Math.random().toString(16).substr(2, 8)}`,
            username: config.username,
            password: config.password,
            reconnectPeriod: 5000,
            keepalive: 30
        };
        
        this.client = null;
        this.subscriptions = new Map();
        this.messageQueue = [];
        this.isConnected = false;
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                // 使用全局 mqtt 对象
                this.client = mqtt.connect(`wss://${this.config.host}:${this.config.port}/mqtt`, {
                    clientId: this.config.clientId,
                    username: this.config.username,
                    password: this.config.password,
                    reconnectPeriod: this.config.reconnectPeriod,
                    keepalive: this.config.keepalive,
                    clean: false,
                    qos: 1
                });

                this.client.on('connect', () => {
                    console.log('MQTT连接成功');
                    this.isConnected = true;
                    this.flushMessageQueue();
                    this.resubscribe();
                    resolve();
                });

                this.client.on('message', (topic, payload, packet) => {
                    const callback = this.subscriptions.get(topic);
                    if (callback) {
                        try {
                            const data = JSON.parse(payload.toString());
                            callback(data, topic);
                        } catch (e) {
                            callback(payload.toString(), topic);
                        }
                    }
                });

                this.client.on('offline', () => {
                    console.warn('MQTT离线');
                    this.isConnected = false;
                });

                this.client.on('error', (err) => {
                    console.error('MQTT错误:', err);
                    reject(err);
                });

            } catch (err) {
                reject(err);
            }
        });
    }

    subscribe(topic, callback, qos = 1) {
        this.subscriptions.set(topic, callback);
        if (this.isConnected) {
            this.client.subscribe(topic, { qos }, (err) => {
                if (err) console.error('订阅失败:', err);
            });
        }
    }

    publish(topic, message, qos = 1, retain = false) {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        
        if (this.isConnected) {
            this.client.publish(topic, payload, { qos, retain }, (err) => {
                if (err) {
                    console.error('发送失败，加入队列:', err);
                    this.enqueueMessage(topic, payload, qos, retain);
                }
            });
        } else {
            console.warn('离线状态，消息已缓存');
            this.enqueueMessage(topic, payload, qos, retain);
        }
    }

    resubscribe() {
        this.subscriptions.forEach((callback, topic) => {
            this.client.subscribe(topic, { qos: 1 });
        });
    }

    enqueueMessage(topic, payload, qos, retain) {
        this.messageQueue.push({ topic, payload, qos, retain, timestamp: Date.now() });
    }

    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            if (Date.now() - msg.timestamp < 3600000) {
                this.publish(msg.topic, msg.payload, msg.qos, msg.retain);
            }
        }
    }

    disconnect() {
        if (this.client) {
            this.client.end();
            this.isConnected = false;
        }
    }
}

export default MQTTClient;