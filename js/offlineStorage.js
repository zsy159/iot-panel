/**
 * 离线数据存储
 * 技术点：IndexedDB、数据同步、存储限额管理
 */
class OfflineStorage {
    constructor(dbName = 'IoTDB', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.maxStorageHours = 8; // 最大存储8小时（呼应你的护老项目）
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 设备数据存储
                if (!db.objectStoreNames.contains('deviceData')) {
                    const store = db.createObjectStore('deviceData', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('deviceId', 'deviceId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // 指令队列存储
                if (!db.objectStoreNames.contains('commandQueue')) {
                    db.createObjectStore('commandQueue', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    /**
     * 缓存传感器数据
     */
    async cacheData(deviceId, data) {
        const record = {
            deviceId,
            data,
            timestamp: Date.now(),
            synced: false
        };
        
        const tx = this.db.transaction(['deviceData'], 'readwrite');
        const store = tx.objectStore('deviceData');
        await store.add(record);
        
        // 清理过期数据
        this.cleanup(deviceId);
    }

    /**
     * 获取未同步数据（网络恢复后上传）
     */
    async getUnsyncedData(deviceId) {
        const tx = this.db.transaction(['deviceData'], 'readonly');
        const store = tx.objectStore('deviceData');
        const index = store.index('deviceId');
        
        return new Promise((resolve) => {
            const request = index.getAll(deviceId);
            request.onsuccess = () => {
                const data = request.result.filter(r => !r.synced);
                resolve(data);
            };
        });
    }

    /**
     * 标记数据已同步
     */
    async markAsSynced(ids) {
        const tx = this.db.transaction(['deviceData'], 'readwrite');
        const store = tx.objectStore('deviceData');
        
        for (const id of ids) {
            const record = await store.get(id);
            if (record) {
                record.synced = true;
                await store.put(record);
            }
        }
    }

    /**
     * 清理8小时前的数据
     */
    async cleanup(deviceId) {
        const cutoff = Date.now() - (this.maxStorageHours * 3600000);
        const tx = this.db.transaction(['deviceData'], 'readwrite');
        const store = tx.objectStore('deviceData');
        const index = store.index('timestamp');
        
        const range = IDBKeyRange.upperBound(cutoff);
        const request = index.openCursor(range);
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (cursor.value.deviceId === deviceId) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };
    }
}

export default OfflineStorage;