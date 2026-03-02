/**
 * 设备管理器
 * 状态流转：离线 -> 在线 -> 告警 -> 维护
 */
class DeviceManager {
    constructor(mqttClient, storage, panel) {
        this.mqtt = mqttClient;
        this.storage = storage;
        this.panel = panel; // 主控面板引用，用于调用弹窗
        this.devices = new Map(); // deviceId -> deviceInfo
        this.uiContainer = document.getElementById('deviceGrid');
        
        // 状态颜色映射
        this.statusColors = {
            offline: '#6b7280',
            online: '#10b981',
            warning: '#f59e0b',
            alarm: '#ef4444',
            maintenance: '#3b82f6'
        };
    }

    /**
     * 添加设备并订阅主题
     */
    addDevice(config) {
        const device = {
            id: config.id,
            name: config.name,
            type: config.type, // sensor/switch/camera
            status: 'offline',
            lastSeen: null,
            data: {}, // 最新传感器值
            history: [], // 最近50条数据（内存缓存）
            element: null // DOM引用
        };
        
        this.devices.set(config.id, device);
        this.renderDeviceCard(device);
        
        // 订阅设备数据主题：iot/device/{id}/data
        this.mqtt.subscribe(`iot/device/${config.id}/data`, (payload) => {
            this.handleDeviceData(config.id, payload);
        });
        
        // 订阅设备状态主题：iot/device/{id}/status
        this.mqtt.subscribe(`iot/device/${config.id}/status`, (payload) => {
            this.updateDeviceStatus(config.id, payload.status);
        });
    }

    /**
     * 处理设备数据
     */
    handleDeviceData(deviceId, data) {
        const device = this.devices.get(deviceId);
        if (!device) return;
        
        device.lastSeen = Date.now();
        device.data = data;
        device.history.push({ ...data, time: Date.now() });
        
        // 只保留最近50条内存缓存
        if (device.history.length > 50) device.history.shift();
        
        // 离线存储（如果开启了本地缓存）
        if (this.storage) {
            this.storage.cacheData(deviceId, data);
        }
        
        // 更新UI
        this.updateDeviceUI(deviceId);
        
        // 检查告警阈值
        this.checkThresholds(deviceId, data);
    }

    /**
     * 检查数据阈值并触发告警
     */
    checkThresholds(deviceId, data) {
        // 温度超过40度告警
        if (data.temperature > 40) {
            this.triggerAlarm(deviceId, '温度过高', `${data.temperature}°C`);
        }
        // 湿度低于20%告警
        if (data.humidity < 20) {
            this.triggerAlarm(deviceId, '湿度过低', `${data.humidity}%`);
        }
        // 电压过低告警
        if (data.voltage < 2.8) {
            this.triggerAlarm(deviceId, '电量不足', `${data.voltage}V`);
        }
    }

    /**
     * 触发告警
     */
    triggerAlarm(deviceId, reason, value) {
        const device = this.devices.get(deviceId);
        device.status = 'alarm';
        this.updateDeviceStatus(deviceId, 'alarm');
        
        // 前端弹窗告警（呼应护老项目的100ms告警）
        this.showAlarmNotification(device.name, reason, value);
        
        // 更新统计（调用主控面板方法）
        if (this.panel && this.panel.updateStats) {
            this.panel.updateStats();
        }
    }

    /**
     * 更新设备状态
     */
    updateDeviceStatus(deviceId, status) {
        const device = this.devices.get(deviceId);
        if (!device || device.status === status) return;
        
        device.status = status;
        
        // 更新状态指示器
        const dot = device.element.querySelector('.status-dot');
        if (dot) {
            dot.style.background = this.statusColors[status];
            dot.className = `status-dot ${status === 'alarm' ? 'blink' : ''}`;
        }
        
        // 更新卡片边框状态
        device.element.className = `device-card ${status}`;
        
        // 更新统计
        if (this.panel && this.panel.updateStats) {
            this.panel.updateStats();
        }
    }

    /**
     * 渲染设备卡片
     */
    renderDeviceCard(device) {
        const card = document.createElement('div');
        card.className = `device-card ${device.status}`;
        card.id = `device-${device.id}`;
        
        // 根据设备类型显示不同图标
        const typeIcons = {
            sensor: '📊',
            switch: '🔌',
            camera: '📷'
        };
        
        card.innerHTML = `
            <div class="device-header">
                <span class="status-dot" style="background: ${this.statusColors.offline}"></span>
                <h4>${typeIcons[device.type] || '📟'} ${device.name}</h4>
                <span class="device-type">${device.type}</span>
            </div>
            <div class="device-data">
                <div class="data-item">
                    <span class="label">温度</span>
                    <span class="value" id="temp-${device.id}">--</span>
                </div>
                <div class="data-item">
                    <span class="label">湿度</span>
                    <span class="value" id="humi-${device.id}">--</span>
                </div>
                <div class="data-item">
                    <span class="label">电压</span>
                    <span class="value" id="volt-${device.id}">--</span>
                </div>
                <div class="data-item">
                    <span class="label">信号</span>
                    <span class="value" id="signal-${device.id}">--</span>
                </div>
            </div>
            <div class="device-actions">
                <button class="cmd-btn primary" data-action="command">
                    <span>⚡ 指令</span>
                </button>
                <button class="cmd-btn secondary" data-action="history">
                    <span>📈 历史</span>
                </button>
            </div>
            <div class="last-seen" id="seen-${device.id}">
                等待连接...
            </div>
        `;
        
        // 绑定按钮事件
        card.querySelector('[data-action="command"]').addEventListener('click', () => {
            if (this.panel) {
                this.panel.showCommandPanel(device.id, device.name);
            }
        });
        
        card.querySelector('[data-action="history"]').addEventListener('click', () => {
            if (this.panel) {
                this.panel.showDeviceHistory(device.id, device.name);
            }
        });
        
        this.uiContainer.appendChild(card);
        device.element = card;
    }

    /**
     * 更新设备UI显示
     */
    updateDeviceUI(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device || !device.element) return;
        
        const tempEl = document.getElementById(`temp-${deviceId}`);
        const humiEl = document.getElementById(`humi-${deviceId}`);
        const voltEl = document.getElementById(`volt-${deviceId}`);
        const signalEl = document.getElementById(`signal-${deviceId}`);
        const seenEl = document.getElementById(`seen-${deviceId}`);
        
        // 更新数值
        if (tempEl) {
            const temp = device.data.temperature;
            tempEl.textContent = temp ? `${temp.toFixed(1)}°C` : '--';
            // 高温标红
            tempEl.style.color = temp > 35 ? '#ef4444' : '#06b6d4';
        }
        
        if (humiEl) {
            const humi = device.data.humidity;
            humiEl.textContent = humi ? `${humi.toFixed(1)}%` : '--';
        }
        
        if (voltEl) {
            const volt = device.data.voltage;
            voltEl.textContent = volt ? `${volt.toFixed(2)}V` : '--';
            // 低电压标黄
            voltEl.style.color = volt < 3.0 ? '#f59e0b' : '#06b6d4';
        }
        
        if (signalEl) {
            // 模拟信号强度
            const signal = Math.floor(Math.random() * 5) + 1;
            signalEl.textContent = '▮'.repeat(signal) + '▯'.repeat(5-signal);
            signalEl.style.color = signal > 3 ? '#10b981' : '#f59e0b';
        }
        
        // 更新最后通信时间
        if (seenEl && device.lastSeen) {
            const timeStr = new Date(device.lastSeen).toLocaleTimeString();
            const elapsed = Date.now() - device.lastSeen;
            seenEl.textContent = elapsed > 60000 ? `${Math.floor(elapsed/60000)}分钟前` : `刚刚 ${timeStr}`;
            seenEl.style.color = elapsed > 300000 ? '#f59e0b' : '#9ca3af'; // 5分钟未更新标黄
        }
    }

    /**
     * 下发控制指令（备用方法，也可通过CommandPanel调用）
     */
    sendCommand(deviceId, command, params = {}) {
        const topic = `iot/device/${deviceId}/command`;
        const message = {
            cmd: command,
            params: params,
            timestamp: Date.now(),
            requestId: Math.random().toString(36).substr(2, 9)
        };
        
        this.mqtt.publish(topic, message, 1);
        
        // 本地显示发送状态
        console.log(`[${deviceId}] 发送指令: ${command}`, params);
    }

    /**
     * 显示告警通知
     */
    showAlarmNotification(deviceName, reason, value) {
        // 检查是否已有相同告警，避免重复
        const existing = document.querySelector(`.alarm-toast[data-device="${deviceName}"]`);
        if (existing) {
            existing.remove();
        }
        
        const notif = document.createElement('div');
        notif.className = 'alarm-toast';
        notif.setAttribute('data-device', deviceName);
        notif.innerHTML = `
            <strong>⚠️ 设备告警</strong>
            <p><b>${deviceName}</b></p>
            <p>${reason}: ${value}</p>
            <p class="alarm-time">${new Date().toLocaleTimeString()}</p>
        `;
        
        document.body.appendChild(notif);
        
        // 5秒后自动移除
        setTimeout(() => {
            if (notif.parentNode) {
                notif.remove();
            }
        }, 5000);
        
        // 点击立即关闭
        notif.addEventListener('click', () => notif.remove());
    }

    /**
     * 获取设备列表（用于调试）
     */
    getDeviceList() {
        return Array.from(this.devices.values()).map(d => ({
            id: d.id,
            name: d.name,
            status: d.status,
            lastSeen: d.lastSeen,
            dataCount: d.history.length
        }));
    }

    /**
     * 批量更新设备状态（用于网络恢复后同步）
     */
    batchUpdateStatus(statusMap) {
        statusMap.forEach((status, deviceId) => {
            this.updateDeviceStatus(deviceId, status);
        });
    }
}

export default DeviceManager;