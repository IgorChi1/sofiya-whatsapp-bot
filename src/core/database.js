const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const Logger = require('../utils/logger');

/**
 * Система управления базой данных для бота Sofiya
 * Работает с JSON файлами для простоты и надежности
 */
class Database {
    constructor() {
        this.logger = new Logger('DATABASE');
        this.dbPath = path.join(process.cwd(), 'database');
        this.backupPath = path.join(this.dbPath, 'backups');
        
        // Пути к файлам базы данных
        this.files = {
            groups: path.join(this.dbPath, 'groups.json'),
            users: path.join(this.dbPath, 'users.json'),
            rentals: path.join(this.dbPath, 'rentals.json'),
            settings: path.join(this.dbPath, 'settings.json'),
            activity: path.join(this.dbPath, 'activity.json')
        };

        // Кэш данных для быстрого доступа
        this.cache = {
            groups: new Map(),
            users: new Map(),
            rentals: new Map(),
            settings: new Map(),
            activity: new Map()
        };
    }

    /**
     * Инициализация базы данных
     */
    async initialize() {
        try {
            await fs.ensureDir(this.dbPath);
            await fs.ensureDir(this.backupPath);
            
            // Загрузка всех данных в кэш
            await this.loadAllData();
            
            this.logger.success('Database initialized successfully');
        } catch (error) {
            this.logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Загрузка всех данных в кэш
     */
    async loadAllData() {
        for (const [type, filePath] of Object.entries(this.files)) {
            try {
                if (await fs.pathExists(filePath)) {
                    const data = await fs.readJson(filePath);
                    this.cache[type].clear();
                    
                    if (typeof data === 'object' && data !== null) {
                        for (const [key, value] of Object.entries(data)) {
                            this.cache[type].set(key, value);
                        }
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to load ${type} data:`, error);
                this.cache[type].clear();
            }
        }
    }

    /**
     * Сохранение данных кэша в файл
     */
    async saveData(type) {
        try {
            const data = Object.fromEntries(this.cache[type]);
            await fs.writeJson(this.files[type], data, { spaces: 2 });
        } catch (error) {
            this.logger.error(`Failed to save ${type} data:`, error);
            throw error;
        }
    }

    /**
     * Автоматическое создание бэкапа
     */
    async createBackup() {
        try {
            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const backupDir = path.join(this.backupPath, timestamp);
            await fs.ensureDir(backupDir);

            for (const [type, filePath] of Object.entries(this.files)) {
                if (await fs.pathExists(filePath)) {
                    const backupFile = path.join(backupDir, `${type}.json`);
                    await fs.copy(filePath, backupFile);
                }
            }

            this.logger.info(`Database backup created: ${timestamp}`);
            
            // Удаление старых бэкапов (старше 30 дней)
            await this.cleanOldBackups();
            
        } catch (error) {
            this.logger.error('Backup creation failed:', error);
        }
    }

    /**
     * Очистка старых бэкапов
     */
    async cleanOldBackups(days = 30) {
        try {
            const backups = await fs.readdir(this.backupPath);
            const cutoff = moment().subtract(days, 'days');

            for (const backup of backups) {
                const backupPath = path.join(this.backupPath, backup);
                const stats = await fs.stat(backupPath);
                
                if (moment(stats.mtime).isBefore(cutoff)) {
                    await fs.remove(backupPath);
                }
            }
        } catch (error) {
            this.logger.warn('Backup cleanup failed:', error);
        }
    }

    // ===========================================
    // МЕТОДЫ ДЛЯ РАБОТЫ С ГРУППАМИ
    // ===========================================

    /**
     * Получение данных группы
     */
    getGroup(groupId) {
        return this.cache.groups.get(groupId) || null;
    }

    /**
     * Сохранение данных группы
     */
    async setGroup(groupId, data) {
        this.cache.groups.set(groupId, {
            ...data,
            id: groupId,
            updatedAt: moment().toISOString()
        });
        await this.saveData('groups');
    }

    /**
     * Удаление группы
     */
    async deleteGroup(groupId) {
        this.cache.groups.delete(groupId);
        await this.saveData('groups');
    }

    /**
     * Получение всех групп
     */
    getAllGroups() {
        return Array.from(this.cache.groups.values());
    }

    // ===========================================
    // МЕТОДЫ ДЛЯ РАБОТЫ С АРЕНДОЙ
    // ===========================================

    /**
     * Получение данных аренды группы
     */
    getRental(groupId) {
        return this.cache.rentals.get(groupId) || null;
    }

    /**
     * Создание новой аренды
     */
    async createRental(groupId, plan, duration) {
        const rental = {
            groupId,
            plan,
            startDate: moment().toISOString(),
            endDate: moment().add(duration, 'hours').toISOString(),
            status: 'active',
            createdAt: moment().toISOString()
        };

        this.cache.rentals.set(groupId, rental);
        await this.saveData('rentals');
        
        this.logger.rental(groupId, 'created', rental);
        return rental;
    }

    /**
     * Продление аренды
     */
    async extendRental(groupId, hours) {
        const rental = this.getRental(groupId);
        if (!rental) return null;

        rental.endDate = moment(rental.endDate).add(hours, 'hours').toISOString();
        rental.updatedAt = moment().toISOString();

        this.cache.rentals.set(groupId, rental);
        await this.saveData('rentals');
        
        this.logger.rental(groupId, 'extended', { hours });
        return rental;
    }

    /**
     * Проверка активности аренды
     */
    isRentalActive(groupId) {
        const rental = this.getRental(groupId);
        if (!rental) return false;

        const now = moment();
        const endDate = moment(rental.endDate);
        
        return now.isBefore(endDate) && rental.status === 'active';
    }

    /**
     * Получение истекающих аренд
     */
    getExpiringRentals(hours = 24) {
        const cutoff = moment().add(hours, 'hours');
        const expiring = [];

        for (const rental of this.cache.rentals.values()) {
            if (rental.status === 'active' && moment(rental.endDate).isBefore(cutoff)) {
                expiring.push(rental);
            }
        }

        return expiring;
    }

    /**
     * Деактивация просроченных аренд
     */
    async deactivateExpiredRentals() {
        const now = moment();
        let deactivated = 0;

        for (const [groupId, rental] of this.cache.rentals.entries()) {
            if (rental.status === 'active' && moment(rental.endDate).isBefore(now)) {
                rental.status = 'expired';
                rental.deactivatedAt = now.toISOString();
                deactivated++;
                
                this.logger.rental(groupId, 'expired');
            }
        }

        if (deactivated > 0) {
            await this.saveData('rentals');
        }

        return deactivated;
    }

    // ===========================================
    // МЕТОДЫ ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ
    // ===========================================

    /**
     * Получение данных пользователя
     */
    getUser(userId) {
        return this.cache.users.get(userId) || null;
    }

    /**
     * Сохранение данных пользователя
     */
    async setUser(userId, data) {
        this.cache.users.set(userId, {
            ...data,
            id: userId,
            updatedAt: moment().toISOString()
        });
        await this.saveData('users');
    }

    // ===========================================
    // МЕТОДЫ ДЛЯ РАБОТЫ С НАСТРОЙКАМИ
    // ===========================================

    /**
     * Получение настроек группы
     */
    getGroupSettings(groupId) {
        const defaultSettings = {
            antiSpam: {
                antiLink: false,
                antiLink2: false,
                antiCall: false,
                antiPrivate: false,
                antiDelete: false
            },
            moderation: {
                welcome: false,
                restrict: false,
                autoRead: false,
                autoAdmin: false
            }
        };

        return this.cache.settings.get(groupId) || defaultSettings;
    }

    /**
     * Обновление настроек группы
     */
    async updateGroupSettings(groupId, settings) {
        const current = this.getGroupSettings(groupId);
        const updated = { ...current, ...settings, updatedAt: moment().toISOString() };
        
        this.cache.settings.set(groupId, updated);
        await this.saveData('settings');
        
        return updated;
    }

    // ===========================================
    // МЕТОДЫ ДЛЯ РАБОТЫ С АКТИВНОСТЬЮ
    // ===========================================

    /**
     * Записать активность пользователя
     */
    async recordActivity(groupId, userId, type = 'message') {
        const key = `${groupId}:${userId}`;
        const activity = this.cache.activity.get(key) || {
            groupId,
            userId,
            messageCount: 0,
            lastSeen: null,
            firstSeen: null
        };

        activity.messageCount++;
        activity.lastSeen = moment().toISOString();
        
        if (!activity.firstSeen) {
            activity.firstSeen = moment().toISOString();
        }

        this.cache.activity.set(key, activity);
        
        // Периодическое сохранение (каждые 10 сообщений)
        if (activity.messageCount % 10 === 0) {
            await this.saveData('activity');
        }
    }

    /**
     * Получение неактивных пользователей
     */
    getInactiveUsers(groupId, days = 7) {
        const cutoff = moment().subtract(days, 'days');
        const inactive = [];

        for (const activity of this.cache.activity.values()) {
            if (activity.groupId === groupId) {
                const lastSeen = moment(activity.lastSeen);
                if (lastSeen.isBefore(cutoff)) {
                    inactive.push(activity);
                }
            }
        }

        return inactive;
    }
}

module.exports = Database; 