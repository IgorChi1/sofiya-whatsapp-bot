const moment = require('moment');
const Logger = require('../utils/logger');

/**
 * Обработчик команд бота ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂
 * Реализует все функции из технического задания
 */
class CommandHandler {
    constructor(bot) {
        this.bot = bot;
        this.logger = new Logger('COMMAND');
        this.config = bot.config;
        
        // Маппинг команд на методы
        this.commands = {
            // Управление участниками
            'вызов': this.callAll.bind(this),
            'внимание': this.attention.bind(this),
            'снести': this.kickUser.bind(this),
            'удалить': this.deleteMessages.bind(this),
            'молчуны': this.findSilent.bind(this),
            'неактивные': this.findInactive.bind(this),
            'активность': this.getActivity.bind(this),
            
            // Администрирование
            'автоадмин': this.autoAdmin.bind(this),
            'создатель': this.getCreator.bind(this),
            'ссылка': this.getGroupLink.bind(this),
            
            // Управление группой
            'закрыть': this.closeGroup.bind(this),
            'открыть': this.openGroup.bind(this),
            
            // Антиспам система
            'антиссылка': this.toggleAntiLink.bind(this),
            'антиссылка2': this.toggleAntiLink2.bind(this),
            'антивызов': this.toggleAntiCall.bind(this),
            'антиличка': this.toggleAntiPrivate.bind(this),
            'антиудаление': this.toggleAntiDelete.bind(this),
            
            // Настройки
            'приветствие': this.toggleWelcome.bind(this),
            'ограничить': this.toggleRestrict.bind(this),
            'авточтение': this.toggleAutoRead.bind(this),
            
            // Система аренды
            'аренда': this.rental.bind(this),
            'чекаренды': this.checkRental.bind(this),
            'удалитьаренду': this.deleteRental.bind(this),
            
            // Служебные команды
            'помощь': this.help.bind(this),
            'статус': this.status.bind(this)
        };
    }

    /**
     * Основной обработчик команд
     */
    async handle(messageInfo) {
        try {
            const { text, chatId, senderId, isGroup } = messageInfo;
            
            // Извлечение команды и аргументов
            const fullCommand = text.slice(this.config.bot.prefix.length).trim().toLowerCase();
            const [command, ...args] = fullCommand.split(' ');

            // Проверка существования команды
            if (!this.commands[command]) {
                return;
            }

            // Проверка прав доступа
            const hasAccess = await this.checkAccess(messageInfo, command);
            if (!hasAccess) {
                await this.sendNoPermission(chatId);
                return;
            }

            // Логирование команды
            this.logger.command(chatId, senderId, command, true);

            // Выполнение команды
            await this.commands[command](messageInfo, args);

        } catch (error) {
            this.logger.error('Command handling error:', error);
            this.logger.command(messageInfo.chatId, messageInfo.senderId, 'unknown', false);
        }
    }

    /**
     * Проверка прав доступа к команде
     */
    async checkAccess(messageInfo, command) {
        const { chatId, senderId, isGroup } = messageInfo;
        
        // Владелец имеет доступ ко всем командам
        if (this.isOwner(senderId)) {
            return true;
        }

        // Команды только для групп
        if (!isGroup && !['помощь', 'статус'].includes(command)) {
            return false;
        }

        // Команды аренды доступны всем админам группы
        if (['аренда', 'чекаренды'].includes(command)) {
            return await this.isUserAdmin(chatId, senderId);
        }

        // Команды удаления аренды только для владельца
        if (command === 'удалитьаренду') {
            return this.isOwner(senderId);
        }

        // Остальные команды требуют прав администратора
        return await this.isUserAdmin(chatId, senderId);
    }

    // ===========================================
    // КОМАНДЫ УПРАВЛЕНИЯ УЧАСТНИКАМИ
    // ===========================================

    /**
     * Команда: вызов - массовый вызов участников
     */
    async callAll(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const groupInfo = await this.bot.getGroupInfo(chatId);
            
            if (!groupInfo) {
                await this.bot.sendMessage(chatId, '❌ Не удалось получить информацию о группе');
                return;
            }

            const participants = groupInfo.participants
                .filter(p => !p.id.includes(this.bot.sock.user.id))
                .map(p => p.id);

            if (participants.length === 0) {
                await this.bot.sendMessage(chatId, '❌ Нет участников для вызова');
                return;
            }

            const message = args.length > 0 ? args.join(' ') : '📢 Всеобщий вызов!';
            const mentions = participants.slice(0, 50); // Лимит на 50 упоминаний

            await this.bot.sendMessage(chatId, `${message}\n\n${mentions.map(p => `@${p.split('@')[0]}`).join(' ')}`, {
                mentions: mentions
            });

            this.logger.moderation(chatId, 'call_all', null, `${mentions.length} participants`);

        } catch (error) {
            this.logger.error('Call all error:', error);
            await this.bot.sendMessage(messageInfo.chatId, '❌ Ошибка выполнения команды');
        }
    }

    /**
     * Команда: внимание - привлечение внимания
     */
    async attention(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const message = args.length > 0 ? args.join(' ') : 'Внимание всех участников!';
            
            await this.bot.sendMessage(chatId, `🚨 *ВНИМАНИЕ!* 🚨\n\n${message}`);
            
        } catch (error) {
            this.logger.error('Attention error:', error);
        }
    }

    /**
     * Команда: снести - удаление участника
     */
    async kickUser(messageInfo, args) {
        try {
            const { chatId, quotedMessage } = messageInfo;
            
            let targetUser = null;
            
            // Определение цели
            if (quotedMessage && quotedMessage.key) {
                targetUser = quotedMessage.key.participant || quotedMessage.key.remoteJid;
            } else if (args.length > 0) {
                const number = args[0].replace(/[^0-9]/g, '');
                if (number.length >= 10) {
                    targetUser = number + '@s.whatsapp.net';
                }
            }

            if (!targetUser) {
                await this.bot.sendMessage(chatId, '❌ Укажите пользователя: ответьте на его сообщение или укажите номер');
                return;
            }

            // Выполнение удаления
            await this.bot.sock.groupParticipantsUpdate(chatId, [targetUser], 'remove');
            
            await this.bot.sendMessage(chatId, `✅ Пользователь @${targetUser.split('@')[0]} удален из группы`, {
                mentions: [targetUser]
            });

            this.logger.moderation(chatId, 'kick_user', targetUser);

        } catch (error) {
            this.logger.error('Kick user error:', error);
            await this.bot.sendMessage(messageInfo.chatId, '❌ Ошибка удаления пользователя');
        }
    }

    /**
     * Команда: удалить - удаление сообщений
     */
    async deleteMessages(messageInfo, args) {
        try {
            const { chatId, quotedMessage } = messageInfo;
            
            if (!quotedMessage) {
                await this.bot.sendMessage(chatId, '❌ Ответьте на сообщение для удаления');
                return;
            }

            // Удаление сообщения
            await this.bot.sock.sendMessage(chatId, {
                delete: quotedMessage.key
            });

            // Удаление команды через 3 секунды
            setTimeout(async () => {
                try {
                    await this.bot.sock.sendMessage(chatId, {
                        delete: messageInfo.message.key
                    });
                } catch (err) {
                    this.logger.warn('Failed to delete command message:', err);
                }
            }, 3000);

            this.logger.moderation(chatId, 'delete_message', quotedMessage.key.participant);

        } catch (error) {
            this.logger.error('Delete message error:', error);
        }
    }

    /**
     * Команда: молчуны - поиск неактивных участников
     */
    async findSilent(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const days = parseInt(args[0]) || 30;
            
            const silentUsers = this.bot.database.getInactiveUsers(chatId, days);
            
            if (silentUsers.length === 0) {
                await this.bot.sendMessage(chatId, `✅ Все участники активны за последние ${days} дней`);
                return;
            }

            let message = `🔇 *Молчуны за ${days} дней:*\n\n`;
            
            for (const user of silentUsers.slice(0, 20)) {
                const lastSeen = user.lastSeen ? moment(user.lastSeen).fromNow() : 'никогда';
                message += `• @${user.userId.split('@')[0]} - ${lastSeen}\n`;
            }

            if (silentUsers.length > 20) {
                message += `\n... и еще ${silentUsers.length - 20} участников`;
            }

            await this.bot.sendMessage(chatId, message, {
                mentions: silentUsers.slice(0, 20).map(u => u.userId)
            });

        } catch (error) {
            this.logger.error('Find silent error:', error);
        }
    }

    /**
     * Команда: неактивные - анализ неактивных пользователей
     */
    async findInactive(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const days = parseInt(args[0]) || 7;
            
            const inactiveUsers = this.bot.database.getInactiveUsers(chatId, days);
            const groupInfo = await this.bot.getGroupInfo(chatId);
            
            const totalParticipants = groupInfo?.participants?.length || 0;
            const activeUsers = totalParticipants - inactiveUsers.length;
            
            let message = `📊 *Анализ активности за ${days} дней:*\n\n`;
            message += `👥 Всего участников: ${totalParticipants}\n`;
            message += `✅ Активные: ${activeUsers}\n`;
            message += `💤 Неактивные: ${inactiveUsers.length}\n\n`;
            
            if (inactiveUsers.length > 0) {
                message += `*Список неактивных:*\n`;
                for (const user of inactiveUsers.slice(0, 15)) {
                    const lastSeen = user.lastSeen ? moment(user.lastSeen).fromNow() : 'никогда';
                    message += `• @${user.userId.split('@')[0]} - ${lastSeen}\n`;
                }
                
                if (inactiveUsers.length > 15) {
                    message += `\n... и еще ${inactiveUsers.length - 15} участников`;
                }
            }

            await this.bot.sendMessage(chatId, message);

        } catch (error) {
            this.logger.error('Find inactive error:', error);
        }
    }

    /**
     * Команда: активность - статистика активности
     */
    async getActivity(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const groupInfo = await this.bot.getGroupInfo(chatId);
            const rental = this.bot.database.getRental(chatId);
            
            let message = `📈 *Статистика группы:*\n\n`;
            message += `👥 Участников: ${groupInfo?.participants?.length || 0}\n`;
            message += `📅 Создана: ${groupInfo?.creation ? moment(groupInfo.creation * 1000).format('DD.MM.YYYY') : 'Неизвестно'}\n`;
            
            if (rental) {
                const timeLeft = moment(rental.endDate).fromNow();
                message += `💰 Аренда до: ${timeLeft}\n`;
                message += `📋 Тариф: ${rental.plan}\n`;
            }
            
            // Статистика за последние 7 дней
            const recentActivity = this.bot.database.getInactiveUsers(chatId, 7);
            const activeCount = (groupInfo?.participants?.length || 0) - recentActivity.length;
            
            message += `\n📊 *За 7 дней:*\n`;
            message += `✅ Активные: ${activeCount}\n`;
            message += `💤 Неактивные: ${recentActivity.length}\n`;

            await this.bot.sendMessage(chatId, message);

        } catch (error) {
            this.logger.error('Get activity error:', error);
        }
    }

    // ===========================================
    // КОМАНДЫ АДМИНИСТРИРОВАНИЯ
    // ===========================================

    /**
     * Команда: автоадмин - автоматическое назначение админов
     */
    async autoAdmin(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const settings = this.bot.database.getGroupSettings(chatId);
            
            settings.moderation.autoAdmin = !settings.moderation.autoAdmin;
            await this.bot.database.updateGroupSettings(chatId, settings);
            
            const status = settings.moderation.autoAdmin ? 'включен' : 'выключен';
            await this.bot.sendMessage(chatId, `⚙️ Автоадмин ${status}`);

        } catch (error) {
            this.logger.error('Auto admin error:', error);
        }
    }

    /**
     * Команда: создатель - информация о создателе
     */
    async getCreator(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const groupInfo = await this.bot.getGroupInfo(chatId);
            
            if (!groupInfo) {
                await this.bot.sendMessage(chatId, '❌ Не удалось получить информацию о группе');
                return;
            }

            const creator = groupInfo.participants.find(p => p.admin === 'superadmin');
            
            if (creator) {
                await this.bot.sendMessage(chatId, `👑 Создатель группы: @${creator.id.split('@')[0]}`, {
                    mentions: [creator.id]
                });
            } else {
                await this.bot.sendMessage(chatId, '❌ Создатель группы не найден');
            }

        } catch (error) {
            this.logger.error('Get creator error:', error);
        }
    }

    /**
     * Команда: ссылка - получение ссылки на группу
     */
    async getGroupLink(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            
            const inviteCode = await this.bot.sock.groupInviteCode(chatId);
            const link = `https://chat.whatsapp.com/${inviteCode}`;
            
            await this.bot.sendMessage(chatId, `🔗 *Ссылка на группу:*\n\n${link}`);

        } catch (error) {
            this.logger.error('Get group link error:', error);
            await this.bot.sendMessage(messageInfo.chatId, '❌ Ошибка получения ссылки на группу');
        }
    }

    // ===========================================
    // КОМАНДЫ УПРАВЛЕНИЯ ГРУППОЙ
    // ===========================================

    /**
     * Команда: закрыть - закрытие группы
     */
    async closeGroup(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            
            await this.bot.sock.groupSettingUpdate(chatId, 'announcement');
            await this.bot.sendMessage(chatId, '🔒 Группа закрыта. Только администраторы могут отправлять сообщения');

        } catch (error) {
            this.logger.error('Close group error:', error);
        }
    }

    /**
     * Команда: открыть - открытие группы
     */
    async openGroup(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            
            await this.bot.sock.groupSettingUpdate(chatId, 'not_announcement');
            await this.bot.sendMessage(chatId, '🔓 Группа открыта. Все участники могут отправлять сообщения');

        } catch (error) {
            this.logger.error('Open group error:', error);
        }
    }

    // ===========================================
    // КОМАНДЫ АНТИСПАМ СИСТЕМЫ
    // ===========================================

    /**
     * Переключение антиспам функций
     */
    async toggleAntiSpamFeature(messageInfo, feature, name) {
        try {
            const { chatId } = messageInfo;
            const settings = this.bot.database.getGroupSettings(chatId);
            
            settings.antiSpam[feature] = !settings.antiSpam[feature];
            await this.bot.database.updateGroupSettings(chatId, settings);
            
            const status = settings.antiSpam[feature] ? 'включена' : 'выключена';
            await this.bot.sendMessage(chatId, `🛡️ ${name} ${status}`);

        } catch (error) {
            this.logger.error(`Toggle ${feature} error:`, error);
        }
    }

    async toggleAntiLink(messageInfo, args) {
        await this.toggleAntiSpamFeature(messageInfo, 'antiLink', 'Антиссылка');
    }

    async toggleAntiLink2(messageInfo, args) {
        await this.toggleAntiSpamFeature(messageInfo, 'antiLink2', 'Антиссылка 2');
    }

    async toggleAntiCall(messageInfo, args) {
        await this.toggleAntiSpamFeature(messageInfo, 'antiCall', 'Антивызов');
    }

    async toggleAntiPrivate(messageInfo, args) {
        await this.toggleAntiSpamFeature(messageInfo, 'antiPrivate', 'Антиличка');
    }

    async toggleAntiDelete(messageInfo, args) {
        await this.toggleAntiSpamFeature(messageInfo, 'antiDelete', 'Антиудаление');
    }

    // ===========================================
    // КОМАНДЫ НАСТРОЕК
    // ===========================================

    async toggleWelcome(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const settings = this.bot.database.getGroupSettings(chatId);
            
            settings.moderation.welcome = !settings.moderation.welcome;
            await this.bot.database.updateGroupSettings(chatId, settings);
            
            const status = settings.moderation.welcome ? 'включено' : 'выключено';
            await this.bot.sendMessage(chatId, `👋 Приветствие ${status}`);

        } catch (error) {
            this.logger.error('Toggle welcome error:', error);
        }
    }

    async toggleRestrict(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const settings = this.bot.database.getGroupSettings(chatId);
            
            settings.moderation.restrict = !settings.moderation.restrict;
            await this.bot.database.updateGroupSettings(chatId, settings);
            
            const status = settings.moderation.restrict ? 'включены' : 'выключены';
            await this.bot.sendMessage(chatId, `🚫 Ограничения ${status}`);

        } catch (error) {
            this.logger.error('Toggle restrict error:', error);
        }
    }

    async toggleAutoRead(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const settings = this.bot.database.getGroupSettings(chatId);
            
            settings.moderation.autoRead = !settings.moderation.autoRead;
            await this.bot.database.updateGroupSettings(chatId, settings);
            
            const status = settings.moderation.autoRead ? 'включено' : 'выключено';
            await this.bot.sendMessage(chatId, `👁️ Авточтение ${status}`);

        } catch (error) {
            this.logger.error('Toggle auto read error:', error);
        }
    }

    // ===========================================
    // КОМАНДЫ СИСТЕМЫ АРЕНДЫ
    // ===========================================

    /**
     * Команда: аренда - информация и управление арендой
     */
    async rental(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const rental = this.bot.database.getRental(chatId);
            
            if (rental && this.bot.database.isRentalActive(chatId)) {
                // Показать текущую аренду
                const timeLeft = moment(rental.endDate).fromNow();
                let message = `💰 *Активная аренда*\n\n`;
                message += `📋 Тариф: ${rental.plan}\n`;
                message += `⏰ Истекает: ${timeLeft}\n`;
                message += `📅 До: ${moment(rental.endDate).format('DD.MM.YYYY HH:mm')}\n\n`;
                message += `📞 Для продления: wa.me/${this.config.bot.ownerNumber}`;
                
                await this.bot.sendMessage(chatId, message);
            } else {
                // Показать тарифы
                const rentalInfo = this.generateRentalInfo(chatId);
                await this.bot.sendMessage(chatId, rentalInfo);
            }

        } catch (error) {
            this.logger.error('Rental error:', error);
        }
    }

    /**
     * Команда: чекаренды - проверка статуса аренды
     */
    async checkRental(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const rental = this.bot.database.getRental(chatId);
            
            if (!rental) {
                await this.bot.sendMessage(chatId, '❌ Аренда не найдена');
                return;
            }

            const isActive = this.bot.database.isRentalActive(chatId);
            const timeLeft = moment(rental.endDate).fromNow();
            
            let message = `📊 *Статус аренды:*\n\n`;
            message += `🔹 Статус: ${isActive ? '✅ Активна' : '❌ Истекла'}\n`;
            message += `📋 Тариф: ${rental.plan}\n`;
            message += `📅 Начало: ${moment(rental.startDate).format('DD.MM.YYYY HH:mm')}\n`;
            message += `📅 Конец: ${moment(rental.endDate).format('DD.MM.YYYY HH:mm')}\n`;
            message += `⏰ ${isActive ? 'Истекает' : 'Истекла'}: ${timeLeft}`;

            await this.bot.sendMessage(chatId, message);

        } catch (error) {
            this.logger.error('Check rental error:', error);
        }
    }

    /**
     * Команда: удалитьаренду - удаление аренды (только владелец)
     */
    async deleteRental(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            
            const rental = this.bot.database.getRental(chatId);
            if (!rental) {
                await this.bot.sendMessage(chatId, '❌ Аренда не найдена');
                return;
            }

            this.bot.database.cache.rentals.delete(chatId);
            await this.bot.database.saveData('rentals');
            
            await this.bot.sendMessage(chatId, '✅ Аренда удалена');
            this.logger.rental(chatId, 'deleted');

        } catch (error) {
            this.logger.error('Delete rental error:', error);
        }
    }

    // ===========================================
    // СЛУЖЕБНЫЕ КОМАНДЫ
    // ===========================================

    /**
     * Команда: помощь - список доступных команд
     */
    async help(messageInfo, args) {
        try {
            const { chatId, senderId, isGroup } = messageInfo;
            const isAdmin = isGroup ? await this.isUserAdmin(chatId, senderId) : false;
            const isOwner = this.isOwner(senderId);
            
            let message = `ℹ️ *꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ - Помощь*\n\n`;
            
            if (isGroup && (isAdmin || isOwner)) {
                message += `👥 *Управление участниками:*\n`;
                message += `• .вызов [текст] - массовый вызов\n`;
                message += `• .внимание [текст] - привлечь внимание\n`;
                message += `• .снести - удалить участника\n`;
                message += `• .удалить - удалить сообщение\n`;
                message += `• .молчуны [дни] - найти неактивных\n`;
                message += `• .активность - статистика группы\n\n`;
                
                message += `⚙️ *Администрирование:*\n`;
                message += `• .автоадмин - переключить автоадмин\n`;
                message += `• .создатель - информация о создателе\n`;
                message += `• .ссылка - получить ссылку группы\n`;
                message += `• .закрыть/.открыть - управление группой\n\n`;
                
                message += `🛡️ *Антиспам:*\n`;
                message += `• .антиссылка - блокировка ссылок\n`;
                message += `• .антивызов - блокировка спам-вызовов\n`;
                message += `• .приветствие - переключить приветствие\n\n`;
                
                message += `💰 *Аренда:*\n`;
                message += `• .аренда - информация об аренде\n`;
                message += `• .чекаренды - проверить статус\n`;
            } else {
                message += `💰 *Доступные команды:*\n`;
                message += `• .аренда - информация об аренде\n`;
                message += `• .помощь - эта справка\n`;
            }
            
            message += `\n📞 Поддержка: wa.me/${this.config.bot.ownerNumber}`;

            await this.bot.sendMessage(chatId, message);

        } catch (error) {
            this.logger.error('Help error:', error);
        }
    }

    /**
     * Команда: статус - статус бота
     */
    async status(messageInfo, args) {
        try {
            const { chatId } = messageInfo;
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            
            let message = `🤖 *꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ Статус:*\n\n`;
            message += `✅ Статус: Онлайн\n`;
            message += `⏱️ Работает: ${hours}ч ${minutes}м\n`;
            message += `👥 Активных групп: ${this.bot.activeGroups.size}\n`;
            message += `📊 Версия: ${this.config.bot.version}\n`;
            message += `🔧 Платформа: Termux Optimized`;

            await this.bot.sendMessage(chatId, message);

        } catch (error) {
            this.logger.error('Status error:', error);
        }
    }

    // ===========================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ===========================================

    /**
     * Генерация информации об аренде
     */
    generateRentalInfo(chatId) {
        const { plans } = this.config.rental;
        
        let message = `💰 *꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ - Аренда бота*\n\n`;
        message += `📋 *Доступные тарифы:*\n\n`;

        for (const [key, plan] of Object.entries(plans)) {
            message += `🔹 *${plan.name}* - ${plan.price} ${this.config.rental.currency}\n`;
            message += `   ⏱️ Срок: ${plan.duration} часов\n\n`;
        }

        message += `💳 *Для активации:*\n`;
        message += `📞 Свяжитесь с администратором: wa.me/${this.config.bot.ownerNumber}\n\n`;
        message += `🆔 *ID группы:* \`${chatId}\``;

        return message;
    }

    /**
     * Отправка сообщения об отсутствии прав
     */
    async sendNoPermission(chatId) {
        await this.bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этой команды');
    }

    /**
     * Проверка прав администратора
     */
    async isUserAdmin(chatId, userId) {
        return await this.bot.messageHandler.isUserAdmin(chatId, userId);
    }

    /**
     * Проверка на владельца бота
     */
    isOwner(userId) {
        return this.bot.messageHandler.isOwner(userId);
    }
}

module.exports = CommandHandler; 