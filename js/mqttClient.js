/**
 * MQTT客户端封装
 * 技术点：断线重连、消息QoS、心跳保活
 */
class MQTTClient {
    constructor(config) {
        this.config = {
            host: config.host || 'broker.hivemq.com', // 公共测试服务器
            port: config.port || 8884, // WSS端口
            clientId: config.clientId || `web_${Math.random().toString(16).substr(2, 8)}`,
            username: config.username,
            password: config.password,
            reconnectPeriod: 5000, // 5秒重连
            keepalive: 30 // 30秒心跳
        };
        
        this.client = null;
        this.subscriptions = new Map(); // 主题 -> 回调函数
        this.messageQueue = []; // 离线消息队列
        this.isConnected = false;
        this.reconnectTimer = null;
    }

    /**
     * 连接（支持断线重连）
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.client = mqtt.connect(`wss://${this.config.host}:${this.config.port}/mqtt`, {
                    clientId: this.config.clientId,
                    username: this.config.username,
                    password: this.config.password,
                    reconnectPeriod: this.config.reconnectPeriod,
                    keepalive: this.config.keepalive,
                    clean: false, // 持久会话，断线后保留订阅
                    qos: 1
                });

                this.client.on('connect', () => {
                    console.log('MQTT连接成功');
                    this.isConnected = true;
                    this.flushMessageQueue(); // 发送离线缓存的指令
                    this.resubscribe(); // 重新订阅
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
                    this.onOffline();
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

    /**
     * 订阅主题
     */
    subscribe(topic, callback, qos = 1) {
        this.subscriptions.set(topic, callback);
        if (this.isConnected) {
            this.client.subscribe(topic, { qos }, (err) => {
                if (err) console.error('订阅失败:', err);
                else console.log('已订阅:', topic);
            });
        }
    }

    /**
     * 发布指令（支持离线缓存）
     */
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

    /**
     * 断线重连后重新订阅
     */
    resubscribe() {
        this.subscriptions.forEach((callback, topic) => {
            this.client.subscribe(topic, { qos: 1 });
        });
    }

    /**
     * 离线消息队列（内存级，可扩展为IndexedDB）
     */
    enqueueMessage(topic, payload, qos, retain) {
        this.messageQueue.push({ topic, payload, qos, retain, timestamp: Date.now() });
    }

    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            // 检查消息时效（超过1小时丢弃）
            if (Date.now() - msg.timestamp < 3600000) {
                this.publish(msg.topic, msg.payload, msg.qos, msg.retain);
            }
        }
    }

    onOffline() {
        // 触发UI更新，显示离线状态
        document.dispatchEvent(new CustomEvent('mqtt:offline'));
    }

    disconnect() {
        if (this.client) {
            this.client.end();
            this.isConnected = false;
        }
    }
}

export default MQTTClient;