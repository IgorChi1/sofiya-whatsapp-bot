const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    jidNormalizedUser,
    proto,
    getContentType,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const cron = require('node-cron');

// Внутренние модули
const Database = require('./database');
const Logger = require('../utils/logger');
const MessageHandler = require('../handlers/messageHandler');
const CommandHandler = require('../handlers/commandHandler');
const EventHandler = require('../handlers/eventHandler');

/**
 * Основной класс бота ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂
 * Управляет соединением с WhatsApp и всеми функциями
 */
class SofiyaBot {
    constructor(config) {
        this.config = config;
        this.logger = new Logger('BOT');
        this.database = new Database();
        
        // WhatsApp сокет
        this.sock = null;
        this.authState = null;
        
        // Обработчики
        this.messageHandler = null;
        this.commandHandler = null;
        this.eventHandler = null;
        
        // Системные переменные
        this.isConnected = false;
        this.activeGroups = new Set();
        this.rateLimiter = new Map(); // Защита от спама
        
        // Инициализация момента на русский
        moment.locale('ru');
    }

    /**
     * Запуск бота
     */
    async start() {
        try {
            this.logger.info('Starting Sofiya bot...');
            
            // Инициализация базы данных
            await this.database.initialize();
            
            // Настройка авторизации
            await this.setupAuth();
            
            // Создание соединения
            await this.createConnection();
            
            // Инициализация обработчиков
            this.initializeHandlers();
            
            // Настройка событий
            this.setupEventListeners();
            
            // Запуск периодических задач
            this.startCronJobs();
            
            this.logger.success('Bot started successfully!');
            
        } catch (error) {
            this.logger.error('Failed to start bot:', error);
            throw error;
        }
    }

    /**
     * Настройка авторизации
     */
    async setupAuth() {
        const authDir = path.join(process.cwd(), 'sessions');
        await fs.ensureDir(authDir);
        
        this.authState = await useMultiFileAuthState(authDir);
        this.logger.info('Auth state initialized');
    }

    /**
     * Создание соединения с WhatsApp
     */
    async createConnection() {
        this.sock = makeWASocket({
            auth: this.authState.state,
            printQRInTerminal: false, // Мы сами обработаем QR
            browser: ['Sofiya Bot', 'Chrome', '10.15.7'],
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            generateHighQualityLinkPreview: false,
            markOnlineOnConnect: false,
            maxMsgRetryCount: 2,
            msgRetryCounterMap: {},
            retryRequestDelayMs: 5000
        });
    }

    /**
     * Инициализация обработчиков
     */
    initializeHandlers() {
        this.messageHandler = new MessageHandler(this);
        this.commandHandler = new CommandHandler(this);
        this.eventHandler = new EventHandler(this);
    }

    /**
     * Настройка слушателей событий
     */
    setupEventListeners() {
        // Обновления авторизации
        this.sock.ev.on('creds.update', this.authState.saveCreds);

        // Изменения соединения
        this.sock.ev.on('connection.update', (update) => {
            this.handleConnectionUpdate(update);
        });

        // Новые сообщения
        this.sock.ev.on('messages.upsert', (messageInfo) => {
            this.messageHandler.handle(messageInfo);
        });

        // События групп
        this.sock.ev.on('group-participants.update', (participantUpdate) => {
            this.eventHandler.handleParticipantUpdate(participantUpdate);
        });

        // Обновления групп
        this.sock.ev.on('groups.update', (groupsUpdate) => {
            this.eventHandler.handleGroupUpdate(groupsUpdate);
        });
    }

    /**
     * Обработка обновлений соединения
     */
    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n🔗 QR Code для авторизации:');
            qrcode.generate(qr, { small: true });
            console.log('\n📱 Отсканируйте QR код в WhatsApp Web\n');
        }

        if (connection === 'close') {
            this.isConnected = false;
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            this.logger.warn('Connection closed:', lastDisconnect?.error);
            
            if (shouldReconnect) {
                this.logger.info('Attempting to reconnect...');
                setTimeout(() => this.createConnection(), 5000);
            } else {
                this.logger.error('Bot logged out, manual restart required');
            }
        } else if (connection === 'open') {
            this.isConnected = true;
            this.logger.success('WhatsApp connection established');
            
            // Загрузка активных групп
            await this.loadActiveGroups();
            
            // Отправка уведомления владельцу
            await this.notifyOwner('🤖 Бот ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ успешно запущен!');
        }
    }

    /**
     * Загрузка активных групп
     */
    async loadActiveGroups() {
        try {
            const groups = await this.sock.groupFetchAllParticipating();
            let activeCount = 0;

            for (const [groupId, groupData] of Object.entries(groups)) {
                if (this.database.isRentalActive(groupId) || groupId === this.config.bot.ownerNumber) {
                    this.activeGroups.add(groupId);
                    activeCount++;
                    
                    // Сохранение данных группы
                    await this.database.setGroup(groupId, {
                        name: groupData.subject,
                        participants: groupData.participants?.length || 0,
                        lastUpdate: moment().toISOString()
                    });
                }
            }

            this.logger.info(`Loaded ${activeCount} active groups`);
            
            // Проверка лимита групп
            if (activeCount > this.config.limits.maxGroups) {
                this.logger.warn(`Active groups (${activeCount}) exceed limit (${this.config.limits.maxGroups})`);
            }
            
        } catch (error) {
            this.logger.error('Failed to load groups:', error);
        }
    }

    /**
     * Запуск периодических задач
     */
    startCronJobs() {
        // Проверка истекающих аренд каждый час
        cron.schedule('0 * * * *', async () => {
            await this.checkExpiredRentals();
        });

        // Создание бэкапа каждые 6 часов
        cron.schedule('0 */6 * * *', async () => {
            await this.database.createBackup();
        });

        // Очистка логов каждую неделю
        cron.schedule('0 0 * * 0', async () => {
            await this.logger.cleanOldLogs();
        });

        // Очистка rate limiter каждые 15 минут
        cron.schedule('*/15 * * * *', () => {
            this.rateLimiter.clear();
        });

        this.logger.info('Cron jobs started');
    }

    /**
     * Проверка истекших аренд
     */
    async checkExpiredRentals() {
        try {
            // Деактивация истекших
            const expired = await this.database.deactivateExpiredRentals();
            if (expired > 0) {
                this.logger.info(`Deactivated ${expired} expired rentals`);
            }

            // Предупреждения о скором истечении
            const expiring = this.database.getExpiringRentals(24);
            for (const rental of expiring) {
                await this.notifyExpiringRental(rental);
            }

        } catch (error) {
            this.logger.error('Failed to check expired rentals:', error);
        }
    }

    /**
     * Уведомление о истекающей аренде
     */
    async notifyExpiringRental(rental) {
        const timeLeft = moment(rental.endDate).fromNow();
        const message = `⚠️ Внимание!\n\nАренда бота в этой группе истекает ${timeLeft}.\n\nДля продления используйте команду .аренда`;
        
        await this.sendMessage(rental.groupId, message);
    }

    /**
     * Отправка сообщения
     */
    async sendMessage(chatId, message, options = {}) {
        try {
            if (!this.isConnected) {
                this.logger.warn('Cannot send message: not connected');
                return false;
            }

            // Проверка rate limiting
            if (this.isRateLimited(chatId)) {
                this.logger.warn(`Rate limited for chat: ${chatId}`);
                return false;
            }

            await this.sock.sendMessage(chatId, { text: message, ...options });
            this.updateRateLimit(chatId);
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to send message:', error);
            return false;
        }
    }

    /**
     * Проверка rate limiting
     */
    isRateLimited(chatId) {
        const now = Date.now();
        const limit = this.rateLimiter.get(chatId) || { count: 0, resetTime: now };
        
        if (now > limit.resetTime) {
            limit.count = 0;
            limit.resetTime = now + 60000; // 1 минута
        }
        
        return limit.count >= this.config.limits.messagesPerMinute;
    }

    /**
     * Обновление счетчика rate limiting
     */
    updateRateLimit(chatId) {
        const now = Date.now();
        const limit = this.rateLimiter.get(chatId) || { count: 0, resetTime: now + 60000 };
        
        limit.count++;
        this.rateLimiter.set(chatId, limit);
    }

    /**
     * Уведомление владельца
     */
    async notifyOwner(message) {
        if (this.config.bot.ownerNumber) {
            await this.sendMessage(this.config.bot.ownerNumber + '@s.whatsapp.net', message);
        }
    }

    /**
     * Проверка доступа к группе
     */
    hasGroupAccess(groupId) {
        // Проверка активной аренды
        if (this.database.isRentalActive(groupId)) {
            return true;
        }
        
        // Тестовый период для новых групп (72 часа)
        const groupData = this.database.getGroup(groupId);
        if (groupData && groupData.joinDate) {
            const joinTime = moment(groupData.joinDate);
            const hoursSinceJoin = moment().diff(joinTime, 'hours');
            
            if (hoursSinceJoin <= this.config.rental.defaultTrial) {
                return true;
            }
        }
        
        // Новые группы без данных - дать тестовый период
        if (!groupData) {
            // Сохраняем время присоединения
            this.database.setGroup(groupId, {
                joinDate: moment().toISOString(),
                trialStarted: true
            });
            return true;
        }
        
        return false;
    }

    /**
     * Получение информации о пользователе
     */
    async getUserInfo(userId) {
        try {
            const info = await this.sock.onWhatsApp(userId);
            return info?.[0] || null;
        } catch (error) {
            this.logger.error('Failed to get user info:', error);
            return null;
        }
    }

    /**
     * Получение информации о группе
     */
    async getGroupInfo(groupId) {
        try {
            const metadata = await this.sock.groupMetadata(groupId);
            return metadata;
        } catch (error) {
            this.logger.error('Failed to get group info:', error);
            return null;
        }
    }

    /**
     * Корректное завершение работы
     */
    async shutdown() {
        this.logger.info('Shutting down bot...');
        
        if (this.sock) {
            await this.sock.logout();
        }
        
        await this.database.createBackup();
        this.logger.info('Bot shutdown complete');
    }
}

module.exports = SofiyaBot; 