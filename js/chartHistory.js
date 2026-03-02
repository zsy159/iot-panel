/**
 * 设备历史数据图表
 * 技术点：ECharts时间轴、数据缩放、本地数据查询
 */
class ChartHistory {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chart = null;
        this.deviceId = null;
        
        this.init();
    }

    init() {
        // 创建图表容器
        this.container.innerHTML = `
            <div id="historyChart" style="width: 100%; height: 400px;"></div>
            <div class="chart-controls">
                <button data-range="1h">1小时</button>
                <button data-range="6h" class="active">6小时</button>
                <button data-range="24h">24小时</button>
                <button id="refreshHistory">刷新</button>
            </div>
        `;
        
        this.chart = echarts.init(document.getElementById('historyChart'));
        
        // 绑定时间范围切换
        this.container.querySelectorAll('[data-range]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.container.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.loadHistory(this.deviceId, e.target.dataset.range);
            });
        });
        
        // 刷新按钮
        document.getElementById('refreshHistory').addEventListener('click', () => {
            this.loadHistory(this.deviceId, this.currentRange || '6h');
        });
        
        // 响应式
        window.addEventListener('resize', () => this.chart.resize());
    }

    /**
     * 加载并显示设备历史数据
     */
    async show(deviceId, storage) {
        this.deviceId = deviceId;
        this.storage = storage;
        this.currentRange = '6h';
        
        // 从IndexedDB读取历史数据
        const historyData = await this.loadFromStorage(deviceId, '6h');
        this.render(historyData);
    }

    /**
     * 从本地存储加载数据
     */
    async loadFromStorage(deviceId, range) {
        // 如果没有storage实例，生成模拟数据
        if (!this.storage || !this.storage.db) {
            return this.generateMockData(range);
        }
        
        const hours = parseInt(range);
        const cutoff = Date.now() - (hours * 3600000);
        
        return new Promise((resolve) => {
            const tx = this.storage.db.transaction(['deviceData'], 'readonly');
            const store = tx.objectStore('deviceData');
            const index = store.index('deviceId');
            
            const request = index.getAll(deviceId);
            request.onsuccess = () => {
                const data = request.result
                    .filter(r => r.timestamp > cutoff)
                    .sort((a, b) => a.timestamp - b.timestamp);
                
                resolve(data.length > 0 ? data : this.generateMockData(range));
            };
            request.onerror = () => resolve(this.generateMockData(range));
        });
    }

    /**
     * 生成模拟历史数据（用于演示）
     */
    generateMockData(range) {
        const hours = parseInt(range);
        const points = hours * 12; // 每5分钟一个点
        const data = [];
        let baseTemp = 25;
        
        for (let i = 0; i < points; i++) {
            const time = Date.now() - (points - i) * 300000;
            baseTemp += (Math.random() - 0.5) * 2;
            data.push({
                timestamp: time,
                data: {
                    temperature: Math.max(15, Math.min(45, baseTemp)),
                    humidity: 50 + Math.sin(i / 10) * 20 + Math.random() * 5
                }
            });
        }
        return data;
    }

    render(data) {
        const times = data.map(d => new Date(d.timestamp).toLocaleTimeString());
        const temps = data.map(d => d.data.temperature?.toFixed(1) || 0);
        const humis = data.map(d => d.data.humidity?.toFixed(1) || 0);

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: 'rgba(17, 24, 39, 0.9)',
                borderColor: '#374151',
                textStyle: { color: '#f9fafb' }
            },
            legend: {
                data: ['温度', '湿度'],
                textStyle: { color: '#9ca3af' },
                top: 10
            },
            grid: {
                left: 50,
                right: 20,
                top: 50,
                bottom: 80
            },
            dataZoom: [
                {
                    type: 'inside',
                    start: 50,
                    end: 100
                },
                {
                    type: 'slider',
                    start: 50,
                    end: 100,
                    height: 30,
                    bottom: 20,
                    borderColor: '#374151',
                    fillerColor: 'rgba(6, 182, 212, 0.2)',
                    handleStyle: { color: '#06b6d4' },
                    textStyle: { color: '#9ca3af' }
                }
            ],
            xAxis: {
                type: 'category',
                data: times,
                axisLine: { lineStyle: { color: '#374151' } },
                axisLabel: { color: '#9ca3af', rotate: 45 }
            },
            yAxis: [
                {
                    type: 'value',
                    name: '温度(°C)',
                    position: 'left',
                    axisLine: { lineStyle: { color: '#ef4444' } },
                    axisLabel: { color: '#9ca3af' },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                {
                    type: 'value',
                    name: '湿度(%)',
                    position: 'right',
                    axisLine: { lineStyle: { color: '#3b82f6' } },
                    axisLabel: { color: '#9ca3af' },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: '温度',
                    type: 'line',
                    data: temps,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { color: '#ef4444', width: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
                            { offset: 1, color: 'rgba(239, 68, 68, 0)' }
                        ])
                    }
                },
                {
                    name: '湿度',
                    type: 'line',
                    yAxisIndex: 1,
                    data: humis,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { color: '#3b82f6', width: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                            { offset: 1, color: 'rgba(59, 130, 246, 0)' }
                        ])
                    }
                }
            ]
        };

        this.chart.setOption(option);
    }

    /**
     * 加载指定时间范围的数据
     */
    async loadHistory(deviceId, range) {
        this.currentRange = range;
        const data = await this.loadFromStorage(deviceId, range);
        this.render(data);
    }

    destroy() {
        if (this.chart) {
            this.chart.dispose();
            this.chart = null;
        }
    }
}

export default ChartHistory;