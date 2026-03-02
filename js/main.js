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
        
        // 初始化图表历史（传入容器）
        this.chartHistory = new ChartHistory('historyChartContainer');
        
        // 初始化指令面板
        this.commandPanel = new CommandPanel(this.mqtt);
        
        // 初始化设备管理
        this.devices = new DeviceManager(this.mqtt, this.storage, this);
        
        // 连接MQTT
        try {
            await this.mqtt.connect();
            this.updateConnectionStatus(true);
            this.setupDemoDevices();
        } catch (err) {
            console.error('连接失败:', err);
            this.updateConnectionStatus(false);
            this.enableOfflineMode();
        }

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
            text.textContent = '离线模式';
        }
    }

    setupDemoDevices() {
        const demoDevices = [
            { id: 'dev_001', name: '车间温度传感器A', type: 'sensor' },
            { id: 'dev_002', name: '智能开关B', type: 'switch' },
            { id: 'dev_003', name: '环境检测仪C', type: 'sensor' }
        ];
        
        demoDevices.forEach(d => this.devices.addDevice(d));
        this.startMockDataStream();
        this.updateStats();
    }

    startMockDataStream() {
        setInterval(() => {
            this.devices.devices.forEach((device, id) => {
                const mockData = {
                    temperature: 20 + Math.random() * 30,
                    humidity: 40 + Math.random() * 40,
                    voltage: 3.3 + (Math.random() - 0.5) * 0.5
                };
                this.devices.handleDeviceData(id, mockData);
            });
            this.updateStats();
        }, 2000);
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

    /**
     * 显示设备历史（供DeviceManager调用）
     */
    showDeviceHistory(deviceId, deviceName) {
        document.getElementById('historyDeviceName').textContent = deviceName;
        document.getElementById('historyModal').classList.add('active');
        this.chartHistory.show(deviceId, this.storage);
    }

    /**
     * 显示指令面板（供DeviceManager调用）
     */
    showCommandPanel(deviceId, deviceName) {
        this.commandPanel.show(deviceId, deviceName);
    }

    async onNetworkRestore() {
        console.log('网络恢复，同步数据...');
        this.updateConnectionStatus(true);
        
        for (const [deviceId] of this.devices.devices) {
            const unsynced = await this.storage.getUnsyncedData(deviceId);
            if (unsynced.length > 0) {
                await this.storage.markAsSynced(unsynced.map(d => d.id));
                console.log(`同步了${unsynced.length}条数据`);
            }
        }
    }

    onNetworkLost() {
        console.warn('网络断开');
        this.updateConnectionStatus(false);
    }

    enableOfflineMode() {
        // 从本地加载缓存数据
    }
}

// 全局实例供HTML调用
window.iotPanel = new IoTPanel();