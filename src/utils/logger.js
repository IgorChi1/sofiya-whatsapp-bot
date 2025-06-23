const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const chalk = require('chalk');

/**
 * Система логирования для бота Sofiya
 * Поддержка разных уровней логов и ротации файлов
 */
class Logger {
    constructor(module = 'SYSTEM') {
        this.module = module;
        this.logsDir = path.join(process.cwd(), 'logs');
        this.ensureLogsDir();
    }

    /**
     * Создание директории для логов
     */
    async ensureLogsDir() {
        await fs.ensureDir(this.logsDir);
    }

    /**
     * Получение имени файла лога
     */
    getLogFileName(level) {
        const date = moment().format('YYYY-MM-DD');
        return path.join(this.logsDir, `${level}-${date}.log`);
    }

    /**
     * Форматирование сообщения лога
     */
    formatMessage(level, message, data = null) {
        const timestamp = moment().format('HH:mm:ss');
        const moduleInfo = `[${this.module}]`;
        
        let logMessage = `${timestamp} ${level} ${moduleInfo} ${message}`;
        
        if (data) {
            if (typeof data === 'object') {
                logMessage += `\n${JSON.stringify(data, null, 2)}`;
            } else {
                logMessage += ` ${data}`;
            }
        }
        
        return logMessage;
    }

    /**
     * Запись в файл
     */
    async writeToFile(level, message) {
        try {
            const fileName = this.getLogFileName(level);
            const logMessage = `${message}\n`;
            await fs.appendFile(fileName, logMessage);
        } catch (error) {
            console.error('Logger write error:', error);
        }
    }

    /**
     * Очистка старых логов
     */
    async cleanOldLogs(days = 7) {
        try {
            const files = await fs.readdir(this.logsDir);
            const cutoff = moment().subtract(days, 'days');

            for (const file of files) {
                if (file.endsWith('.log')) {
                    const filePath = path.join(this.logsDir, file);
                    const stats = await fs.stat(filePath);
                    
                    if (moment(stats.mtime).isBefore(cutoff)) {
                        await fs.remove(filePath);
                    }
                }
            }
        } catch (error) {
            console.error('Log cleanup error:', error);
        }
    }

    /**
     * Уровень INFO
     */
    info(message, data = null) {
        const formattedMessage = this.formatMessage('INFO', message, data);
        console.log(chalk.blue('ℹ️ ') + formattedMessage);
        this.writeToFile('info', formattedMessage);
    }

    /**
     * Уровень SUCCESS
     */
    success(message, data = null) {
        const formattedMessage = this.formatMessage('SUCCESS', message, data);
        console.log(chalk.green('✅ ') + formattedMessage);
        this.writeToFile('info', formattedMessage);
    }

    /**
     * Уровень WARNING
     */
    warn(message, data = null) {
        const formattedMessage = this.formatMessage('WARN', message, data);
        console.log(chalk.yellow('⚠️ ') + formattedMessage);
        this.writeToFile('warn', formattedMessage);
    }

    /**
     * Уровень ERROR
     */
    error(message, data = null) {
        const formattedMessage = this.formatMessage('ERROR', message, data);
        console.log(chalk.red('❌ ') + formattedMessage);
        this.writeToFile('error', formattedMessage);
    }

    /**
     * Уровень DEBUG
     */
    debug(message, data = null) {
        if (process.env.NODE_ENV === 'development') {
            const formattedMessage = this.formatMessage('DEBUG', message, data);
            console.log(chalk.gray('🐛 ') + formattedMessage);
            this.writeToFile('debug', formattedMessage);
        }
    }

    /**
     * Логирование команд бота
     */
    command(groupId, userId, command, success = true) {
        const status = success ? 'SUCCESS' : 'FAILED';
        const message = `Command ${command} from ${userId} in ${groupId} - ${status}`;
        
        if (success) {
            this.info(message);
        } else {
            this.warn(message);
        }
    }

    /**
     * Логирование событий аренды
     */
    rental(groupId, action, details = null) {
        const message = `Rental ${action} for group ${groupId}`;
        this.info(message, details);
    }

    /**
     * Логирование модерации
     */
    moderation(groupId, action, target = null, reason = null) {
        const message = `Moderation ${action} in ${groupId}`;
        const data = { target, reason };
        this.info(message, data);
    }
}

module.exports = Logger; 