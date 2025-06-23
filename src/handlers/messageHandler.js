const { jidNormalizedUser, getContentType } = require('@whiskeysockets/baileys');
const moment = require('moment');
const Logger = require('../utils/logger');

/**
 * Обработчик входящих сообщений
 * Фильтрует сообщения, проверяет права доступа и передает команды
 */
class MessageHandler {
    constructor(bot) {
        this.bot = bot;
        this.logger = new Logger('MESSAGE');
        this.config = bot.config;
    }

    /**
     * Основной обработчик сообщений
     */
    async handle(messageInfo) {
        try {
            const { messages, type } = messageInfo;
            
            if (type !== 'notify') return;

            for (const message of messages) {
                await this.processMessage(message);
            }
        } catch (error) {
            this.logger.error('Message handling error:', error);
        }
    }

    /**
     * Обработка отдельного сообщения
     */
    async processMessage(message) {
        try {
            // Пропуск служебных сообщений
            if (!message.message || message.key.fromMe) return;

            const messageInfo = this.extractMessageInfo(message);
            if (!messageInfo) return;

            // Запись активности пользователя
            if (messageInfo.isGroup) {
                await this.bot.database.recordActivity(
                    messageInfo.chatId, 
                    messageInfo.senderId,
                    'message'
                );
            }

            // Проверка доступа к группе
            if (messageInfo.isGroup && !this.bot.hasGroupAccess(messageInfo.chatId)) {
                await this.handleNoAccess(messageInfo);
                return;
            }

            // Обработка команд
            if (messageInfo.text.startsWith(this.config.bot.prefix)) {
                await this.bot.commandHandler.handle(messageInfo);
                return;
            }

            // Проверка антиспам фильтров
            if (messageInfo.isGroup) {
                await this.checkAntiSpam(messageInfo);
            }

        } catch (error) {
            this.logger.error('Message processing error:', error);
        }
    }

    /**
     * Извлечение информации из сообщения
     */
    extractMessageInfo(message) {
        try {
            const messageContent = message.message;
            const messageType = getContentType(messageContent);
            
            if (!messageType) return null;

            const chatId = message.key.remoteJid;
            const senderId = jidNormalizedUser(message.key.participant || chatId);
            const isGroup = chatId.endsWith('@g.us');
            
            let text = '';
            let quotedMessage = null;

            // Извлечение текста в зависимости от типа сообщения
            switch (messageType) {
                case 'conversation':
                    text = messageContent.conversation;
                    break;
                case 'extendedTextMessage':
                    text = messageContent.extendedTextMessage.text;
                    quotedMessage = messageContent.extendedTextMessage.contextInfo?.quotedMessage;
                    break;
                case 'imageMessage':
                    text = messageContent.imageMessage.caption || '';
                    break;
                case 'videoMessage':
                    text = messageContent.videoMessage.caption || '';
                    break;
                default:
                    return null;
            }

            return {
                message,
                chatId,
                senderId,
                text: text.trim(),
                isGroup,
                messageType,
                quotedMessage,
                timestamp: moment(message.messageTimestamp * 1000),
                messageId: message.key.id
            };

        } catch (error) {
            this.logger.error('Message info extraction error:', error);
            return null;
        }
    }

    /**
     * Обработка отсутствия доступа к группе
     */
    async handleNoAccess(messageInfo) {
        // Показать сообщение только на команды аренды
        if (messageInfo.text.startsWith('.аренда') || messageInfo.text.startsWith('.чекаренды')) {
            const rentalInfo = this.generateRentalInfo();
            await this.bot.sendMessage(messageInfo.chatId, rentalInfo);
            
            this.logger.info(`No access denied for group: ${messageInfo.chatId}`);
        }
    }

    /**
     * Генерация информации об аренде
     */
    generateRentalInfo() {
        const { plans } = this.config.rental;
        
        let message = `💰 *꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ - Аренда бота*\n\n`;
        message += `🚫 *Доступ к боту не активен*\n\n`;
        message += `📋 *Доступные тарифы:*\n\n`;

        for (const [key, plan] of Object.entries(plans)) {
            message += `🔹 *${plan.name}* - ${plan.price} ${this.config.rental.currency}\n`;
            message += `   ⏱️ Срок: ${plan.duration} часов\n\n`;
        }

        message += `💳 *Для активации:*\n`;
        message += `1️⃣ Свяжитесь с администратором\n`;
        message += `2️⃣ Оплатите выбранный тариф\n`;
        message += `3️⃣ Получите активацию бота\n\n`;
        
        message += `📞 *Контакт:* wa.me/${this.config.bot.ownerNumber}\n`;
        message += `🆔 *ID группы:* \`${messageInfo.chatId}\``;

        return message;
    }

    /**
     * Проверка антиспам фильтров
     */
    async checkAntiSpam(messageInfo) {
        try {
            const settings = this.bot.database.getGroupSettings(messageInfo.chatId);
            const { antiSpam } = settings;
            const text = messageInfo.text.toLowerCase();

            // Проверка антиссылок
            if (antiSpam.antiLink && this.containsLink(text)) {
                await this.handleAntiLink(messageInfo, 'antiLink');
                return;
            }

            if (antiSpam.antiLink2 && this.containsAdvancedLink(text)) {
                await this.handleAntiLink(messageInfo, 'antiLink2');
                return;
            }

            // Проверка антивызовов
            if (antiSpam.antiCall && this.isSpamCall(text)) {
                await this.handleAntiCall(messageInfo);
                return;
            }

        } catch (error) {
            this.logger.error('Anti-spam check error:', error);
        }
    }

    /**
     * Проверка на ссылки (базовая)
     */
    containsLink(text) {
        const linkPatterns = [
            /https?:\/\/[^\s]+/gi,
            /www\.[^\s]+/gi,
            /[^\s]+\.(com|org|net|io|me|co|ru)/gi,
            /t\.me\/[^\s]+/gi,
            /chat\.whatsapp\.com\/[^\s]+/gi
        ];

        return linkPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Проверка на ссылки (расширенная)
     */
    containsAdvancedLink(text) {
        const advancedPatterns = [
            /[a-zA-Z0-9]+ ?\. ?[a-zA-Z0-9]+/g, // домены с пробелами
            /[^\s]*\*[^\s]*\.[^\s]*/g, // домены со звездочками
            /[^\s]*\([^\s]*\)\.[^\s]*/g, // домены в скобках
        ];

        return advancedPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Проверка на спам-вызовы
     */
    isSpamCall(text) {
        const spamPatterns = [
            /@[0-9]{10,}/g, // массовые упоминания по номерам
            /(@[^\s]+ ){5,}/g, // много упоминаний подряд
        ];

        return spamPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Обработка нарушения антиссылок
     */
    async handleAntiLink(messageInfo, type) {
        try {
            // Удаление сообщения
            await this.bot.sock.sendMessage(messageInfo.chatId, {
                delete: messageInfo.message.key
            });

            // Предупреждение
            const warning = `⚠️ @${messageInfo.senderId.split('@')[0]} нарушил правила!\n\n🚫 Ссылки запрещены в этой группе`;
            
            await this.bot.sendMessage(messageInfo.chatId, warning, {
                mentions: [messageInfo.senderId]
            });

            this.logger.moderation(messageInfo.chatId, `${type}_violation`, messageInfo.senderId);

        } catch (error) {
            this.logger.error('Anti-link handling error:', error);
        }
    }

    /**
     * Обработка нарушения антивызовов
     */
    async handleAntiCall(messageInfo) {
        try {
            // Удаление сообщения
            await this.bot.sock.sendMessage(messageInfo.chatId, {
                delete: messageInfo.message.key
            });

            // Предупреждение
            const warning = `⚠️ @${messageInfo.senderId.split('@')[0]} нарушил правила!\n\n🚫 Массовые вызовы запрещены`;
            
            await this.bot.sendMessage(messageInfo.chatId, warning, {
                mentions: [messageInfo.senderId]
            });

            this.logger.moderation(messageInfo.chatId, 'anticall_violation', messageInfo.senderId);

        } catch (error) {
            this.logger.error('Anti-call handling error:', error);
        }
    }

    /**
     * Проверка прав администратора
     */
    async isUserAdmin(chatId, userId) {
        try {
            const groupInfo = await this.bot.getGroupInfo(chatId);
            if (!groupInfo) return false;

            const participant = groupInfo.participants.find(p => p.id === userId);
            return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');

        } catch (error) {
            this.logger.error('Admin check error:', error);
            return false;
        }
    }

    /**
     * Проверка на владельца бота
     */
    isOwner(userId) {
        return userId.includes(this.config.bot.ownerNumber);
    }
}

module.exports = MessageHandler; 