/**
 * 设备指令控制面板
 * 技术点：指令队列、执行状态反馈、快捷操作
 */
class CommandPanel {
    constructor(mqttClient) {
        this.mqtt = mqttClient;
        this.activeDevice = null;
        this.commandHistory = []; // 指令历史记录
        
        this.init();
    }

    init() {
        // 创建控制面板HTML（动态插入到页面）
        this.panel = document.createElement('div');
        this.panel.className = 'command-panel';
        this.panel.id = 'commandPanel';
        this.panel.style.display = 'none';
        
        this.panel.innerHTML = `
            <div class="panel-header">
                <h4>设备控制</h4>
                <span id="cmdDeviceName">未选择设备</span>
                <button class="close-panel" onclick="this.closest('.command-panel').style.display='none'">×</button>
            </div>
            
            <div class="quick-actions">
                <h5>快捷操作</h5>
                <div class="action-grid">
                    <button class="cmd-btn primary" data-cmd="reboot">
                        <span class="icon">↻</span>
                        <span>重启设备</span>
                    </button>
                    <button class="cmd-btn warning" data-cmd="reset">
                        <span class="icon">↺</span>
                        <span>恢复出厂</span>
                    </button>
                    <button class="cmd-btn success" data-cmd="ota">
                        <span class="icon">⬆</span>
                        <span>固件升级</span>
                    </button>
                    <button class="cmd-btn info" data-cmd="ping">
                        <span class="icon">📡</span>
                        <span>网络检测</span>
                    </button>
                </div>
            </div>
            
            <div class="custom-command">
                <h5>自定义指令</h5>
                <div class="cmd-form">
                    <select id="cmdType">
                        <option value="set">设置参数</option>
                        <option value="get">查询状态</option>
                        <option value="control">控制操作</option>
                    </select>
                    <input type="text" id="cmdParam" placeholder="参数（如：temperature=25）">
                    <button id="sendCustomCmd">发送</button>
                </div>
            </div>
            
            <div class="command-log">
                <h5>指令记录 <span class="clear-log" onclick="commandPanel.clearLog()">清空</span></h5>
                <div id="cmdLog" class="log-container"></div>
            </div>
        `;
        
        document.body.appendChild(this.panel);
        
        // 绑定快捷按钮
        this.panel.querySelectorAll('.cmd-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                this.sendCommand(cmd, {});
            });
        });
        
        // 绑定自定义指令
        document.getElementById('sendCustomCmd').addEventListener('click', () => {
            const type = document.getElementById('cmdType').value;
            const param = document.getElementById('cmdParam').value;
            this.sendCommand(type, this.parseParams(param));
        });
        
        // 回车发送
        document.getElementById('cmdParam').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('sendCustomCmd').click();
            }
        });
    }

    /**
     * 显示面板并绑定设备
     */
    show(deviceId, deviceName) {
        this.activeDevice = deviceId;
        document.getElementById('cmdDeviceName').textContent = deviceName;
        this.panel.style.display = 'block';
        
        // 加载该设备的指令历史
        this.loadCommandHistory(deviceId);
    }

    /**
     * 发送指令
     */
    sendCommand(cmd, params) {
        if (!this.activeDevice) {
            alert('请先选择设备');
            return;
        }

        const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const message = {
            cmd: cmd,
            params: params,
            timestamp: Date.now(),
            requestId: commandId,
            timeout: 30000 // 30秒超时
        };

        // 添加到日志（pending状态）
        this.addLogEntry(commandId, cmd, params, 'pending');
        
        // 通过MQTT发送
        const topic = `iot/device/${this.activeDevice}/command`;
        this.mqtt.publish(topic, message, 1); // QoS 1确保送达

        // 监听响应（如果设备有响应主题）
        const responseTopic = `iot/device/${this.activeDevice}/response/${commandId}`;
        this.mqtt.subscribe(responseTopic, (data) => {
            this.updateLogStatus(commandId, 'success', data);
        }, 0);

        // 设置超时
        setTimeout(() => {
            this.updateLogStatus(commandId, 'timeout');
        }, 30000);

        // 保存到历史
        this.saveCommandHistory(this.activeDevice, {
            cmd, params, time: Date.now(), status: 'pending'
        });
    }

    /**
     * 解析参数字符串为对象
     */
    parseParams(paramStr) {
        if (!paramStr) return {};
        
        const params = {};
        paramStr.split(',').forEach(pair => {
            const [key, value] = pair.split('=').map(s => s.trim());
            if (key) {
                // 尝试转换为数字
                params[key] = isNaN(value) ? value : Number(value);
            }
        });
        return params;
    }

    /**
     * 添加日志条目
     */
    addLogEntry(id, cmd, params, status) {
        const logContainer = document.getElementById('cmdLog');
        const entry = document.createElement('div');
        entry.className = `log-entry ${status}`;
        entry.id = `log-${id}`;
        entry.innerHTML = `
            <span class="log-time">${new Date().toLocaleTimeString()}</span>
            <span class="log-cmd">${cmd}</span>
            <span class="log-params">${JSON.stringify(params)}</span>
            <span class="log-status">${this.getStatusText(status)}</span>
        `;
        
        logContainer.insertBefore(entry, logContainer.firstChild);
        
        // 限制日志数量
        while (logContainer.children.length > 50) {
            logContainer.removeChild(logContainer.lastChild);
        }
    }

    updateLogStatus(id, status, data) {
        const entry = document.getElementById(`log-${id}`);
        if (entry) {
            entry.className = `log-entry ${status}`;
            entry.querySelector('.log-status').textContent = this.getStatusText(status);
            
            if (data && status === 'success') {
                entry.innerHTML += `<span class="log-result">${JSON.stringify(data).substring(0, 100)}</span>`;
            }
        }
    }

    getStatusText(status) {
        const map = {
            pending: '⏳ 发送中',
            success: '✅ 成功',
            timeout: '⏱️ 超时',
            error: '❌ 失败'
        };
        return map[status] || status;
    }

    /**
     * 保存指令历史到localStorage
     */
    saveCommandHistory(deviceId, record) {
        const key = `cmd_history_${deviceId}`;
        const history = JSON.parse(localStorage.getItem(key) || '[]');
        history.unshift(record);
        if (history.length > 20) history.pop(); // 只保留20条
        localStorage.setItem(key, JSON.stringify(history));
    }

    loadCommandHistory(deviceId) {
        const key = `cmd_history_${deviceId}`;
        const history = JSON.parse(localStorage.getItem(key) || '[]');
        
        const logContainer = document.getElementById('cmdLog');
        logContainer.innerHTML = '';
        
        history.forEach(record => {
            this.addLogEntry(
                `hist_${record.time}`,
                record.cmd,
                record.params,
                record.status
            );
        });
    }

    clearLog() {
        document.getElementById('cmdLog').innerHTML = '';
        if (this.activeDevice) {
            localStorage.removeItem(`cmd_history_${this.activeDevice}`);
        }
    }
}

export default CommandPanel;