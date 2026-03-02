import MQTTClient from './mqttClient.js';
import OfflineStorage from './offlineStorage.js';
import DeviceManager from './deviceManager.js';
import ChartHistory from './chartHistory.js';
import CommandPanel from './commandPanel.js';

class IoTPanel {
    constructor() {
        this.mqtt = new MQTTClient({
            host: 'broker.hivemq.com',
            port: 8884,
            clientId: `iot_panel_${Date.now()}`
        });
        
        this.storage = new OfflineStorage();
        this.devices = null;
        this.chartHistory = null;
        this.commandPanel = null;
        
        this.init();
    }

    async init() {
        // 初始化本地存储
        await this.storage.init();
        
        // 初始化图表历史
        this.chartHistory = new ChartHistory('historyChartContainer');
        
        // 初始化指令面板
        this.commandPanel = new CommandPanel(this.mqtt);
        
        // 初始化设备管理（关键：先创建设备，再连接MQTT）
        this.devices = new DeviceManager(this.mqtt, this.storage, this);
        
        // 先添加设备（这样就有数据了）
        this.setupDemoDevices();
        
        // 尝试连接MQTT（不影响已有设备显示）
        try {
            await this.mqtt.connect();
            console.log('MQTT连接成功');
            this.updateConnectionStatus(true);
        } catch (err) {
            console.warn('MQTT连接失败，使用纯模拟模式:', err);
            this.updateConnectionStatus(false);
        }

        // 启动模拟数据（无论MQTT是否成功，都有数据）
        this.startMockDataStream();

        // 网络状态监听
        window.addEventListener('online', () => this.onNetworkRestore());
        window.addEventListener('offline', () => this.onNetworkLost());
    }

    updateConnectionStatus(connected) {
        const dot = document.getElementById('connDot');
        const text = document.getElementById('connStatus');
        
        if (connected) {
            dot.className = 'status-dot online';
            text.textContent = '已连接';
        } else {
            dot.className = 'status-dot offline';
            text.textContent = '模拟模式';
        }
    }

    setupDemoDevices() {
        const demoDevices = [
            { id: 'dev_001', name: '车间温度传感器A', type: 'sensor' },
            { id: 'dev_002', name: '智能开关B', type: 'switch' },
            { id: 'dev_003', name: '环境检测仪C', type: 'sensor' }
        ];
        
        demoDevices.forEach(d => this.devices.addDevice(d));
        this.updateStats();
    }

    startMockDataStream() {
        // 立即执行一次
        this.generateMockData();
        
        // 每2秒更新
        setInterval(() => {
            this.generateMockData();
        }, 5000);
    }

    generateMockData() {
        this.devices.devices.forEach((device, id) => {
            const mockData = {
                temperature: 20 + Math.random() * 30,  // 20-50度
                humidity: 40 + Math.random() * 40,     // 40-80%
                voltage: 3.0 + Math.random() * 0.6     // 3.0-3.6V
            };
            
            // 直接调用处理数据的方法
            this.devices.handleDeviceData(id, mockData);
        });
        
        this.updateStats();
    }

    updateStats() {
        let online = 0, offline = 0, alarm = 0;
        
        this.devices.devices.forEach(device => {
            if (device.status === 'alarm') alarm++;
            else if (device.status === 'online') online++;
            else offline++;
        });
        
        document.getElementById('onlineCount').textContent = online;
        document.getElementById('offlineCount').textContent = offline;
        document.getElementById('alarmCount').textContent = alarm;
    }

    showDeviceHistory(deviceId, deviceName) {
        document.getElementById('historyDeviceName').textContent = deviceName;
        document.getElementById('historyModal').classList.add('active');
        this.chartHistory.show(deviceId, this.storage);
    }

    showCommandPanel(deviceId, deviceName) {
        this.commandPanel.show(deviceId, deviceName);
    }

    async onNetworkRestore() {
        console.log('网络恢复');
        if (!this.mqtt.isConnected) {
            try {
                await this.mqtt.connect();
                this.updateConnectionStatus(true);
            } catch (e) {
                console.error('重连失败:', e);
            }
        }
    }

    onNetworkLost() {
        console.warn('网络断开');
        this.updateConnectionStatus(false);
    }
}

// 启动
window.iotPanel = new IoTPanel();