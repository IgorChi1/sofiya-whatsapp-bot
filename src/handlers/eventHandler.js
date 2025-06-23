const moment = require('moment');
const Logger = require('../utils/logger');

/**
 * Обработчик событий группы для бота ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂
 * Обрабатывает присоединения, покидания, изменения групп
 */
class EventHandler {
    constructor(bot) {
        this.bot = bot;
        this.logger = new Logger('EVENT');
        this.config = bot.config;
    }

    /**
     * Обработка изменений участников группы
     */
    async handleParticipantUpdate(participantUpdate) {
        try {
            const { id: groupId, participants, action } = participantUpdate;

            // Проверка доступа к группе
            if (!this.bot.hasGroupAccess(groupId)) {
                return;
            }

            // Получение настроек группы
            const settings = this.bot.database.getGroupSettings(groupId);

            switch (action) {
                case 'add':
                    await this.handleParticipantAdd(groupId, participants, settings);
                    break;
                case 'remove':
                    await this.handleParticipantRemove(groupId, participants, settings);
                    break;
                case 'promote':
                    await this.handleParticipantPromote(groupId, participants, settings);
                    break;
                case 'demote':
                    await this.handleParticipantDemote(groupId, participants, settings);
                    break;
            }

        } catch (error) {
            this.logger.error('Participant update error:', error);
        }
    }

    /**
     * Обработка присоединения участников
     */
    async handleParticipantAdd(groupId, participants, settings) {
        try {
            for (const participant of participants) {
                // Запись в базу данных
                await this.bot.database.recordActivity(groupId, participant, 'join');

                // Отправка приветствия если включено
                if (settings.moderation.welcome) {
                    await this.sendWelcomeMessage(groupId, participant);
                }

                // Автоматическое назначение администратора если включено
                if (settings.moderation.autoAdmin) {
                    await this.handleAutoAdmin(groupId, participant);
                }

                this.logger.info(`User ${participant} joined group ${groupId}`);
            }

        } catch (error) {
            this.logger.error('Handle participant add error:', error);
        }
    }

    /**
     * Обработка покидания участников
     */
    async handleParticipantRemove(groupId, participants, settings) {
        try {
            for (const participant of participants) {
                this.logger.info(`User ${participant} left group ${groupId}`);

                // Можно добавить уведомление о покидании
                if (settings.moderation.farewell) {
                    const message = `👋 @${participant.split('@')[0]} покинул группу`;
                    await this.bot.sendMessage(groupId, message, {
                        mentions: [participant]
                    });
                }
            }

        } catch (error) {
            this.logger.error('Handle participant remove error:', error);
        }
    }

    /**
     * Обработка повышения участников
     */
    async handleParticipantPromote(groupId, participants, settings) {
        try {
            for (const participant of participants) {
                this.logger.info(`User ${participant} promoted in group ${groupId}`);

                const message = `🎉 @${participant.split('@')[0]} назначен администратором!`;
                await this.bot.sendMessage(groupId, message, {
                    mentions: [participant]
                });
            }

        } catch (error) {
            this.logger.error('Handle participant promote error:', error);
        }
    }

    /**
     * Обработка понижения участников
     */
    async handleParticipantDemote(groupId, participants, settings) {
        try {
            for (const participant of participants) {
                this.logger.info(`User ${participant} demoted in group ${groupId}`);

                const message = `📉 @${participant.split('@')[0]} снят с должности администратора`;
                await this.bot.sendMessage(groupId, message, {
                    mentions: [participant]
                });
            }

        } catch (error) {
            this.logger.error('Handle participant demote error:', error);
        }
    }

    /**
     * Отправка приветственного сообщения
     */
    async sendWelcomeMessage(groupId, participant) {
        try {
            const groupInfo = await this.bot.getGroupInfo(groupId);
            const groupName = groupInfo?.subject || 'группу';

            const welcomeMessage = `👋 Добро пожаловать в *${groupName}*, @${participant.split('@')[0]}!\n\n🤖 Я бот ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ - помощник по модерации группы.\n\n📋 Для получения справки используйте команду #помощь`;

            await this.bot.sendMessage(groupId, welcomeMessage, {
                mentions: [participant]
            });

        } catch (error) {
            this.logger.error('Send welcome message error:', error);
        }
    }

    /**
     * Автоматическое назначение администратора
     */
    async handleAutoAdmin(groupId, participant) {
        try {
            // Логика автоматического назначения админа
            // Например, если пользователь в списке доверенных
            const trustedUsers = this.config.security.trustedUsers || [];
            
            if (trustedUsers.includes(participant.split('@')[0])) {
                // Назначение администратором
                await this.bot.sock.groupParticipantsUpdate(groupId, [participant], 'promote');
                
                const message = `⚡ @${participant.split('@')[0]} автоматически назначен администратором`;
                await this.bot.sendMessage(groupId, message, {
                    mentions: [participant]
                });

                this.logger.info(`Auto-admin promoted: ${participant} in ${groupId}`);
            }

        } catch (error) {
            this.logger.error('Handle auto admin error:', error);
        }
    }

    /**
     * Обработка обновлений группы
     */
    async handleGroupUpdate(groupsUpdate) {
        try {
            for (const update of groupsUpdate) {
                const { id: groupId, subject, announce } = update;

                // Проверка доступа к группе
                if (!this.bot.hasGroupAccess(groupId)) {
                    continue;
                }

                // Обновление информации о группе в базе данных
                if (subject) {
                    const groupData = this.bot.database.getGroup(groupId) || {};
                    groupData.name = subject;
                    await this.bot.database.setGroup(groupId, groupData);
                    this.logger.info(`Group ${groupId} name changed to: ${subject}`);
                }
            }

        } catch (error) {
            this.logger.error('Group update error:', error);
        }
    }

    /**
     * Обработка удаленных сообщений
     */
    async handleMessageDelete(deleteInfo) {
        try {
            const { remoteJid: groupId, fromMe, id, participant } = deleteInfo;

            // Проверка доступа к группе
            if (!this.bot.hasGroupAccess(groupId)) {
                return;
            }

            // Пропуск собственных удалений
            if (fromMe) {
                return;
            }

            const settings = this.bot.database.getGroupSettings(groupId);

            // Если включена защита от удаления
            if (settings.antiSpam.antiDelete && participant) {
                const message = `🚫 @${participant.split('@')[0]} удалил сообщение!\n\n⚠️ Удаление сообщений может нарушать правила группы.`;
                
                await this.bot.sendMessage(groupId, message, {
                    mentions: [participant]
                });

                this.logger.moderation(groupId, 'message_deleted', participant);
            }

        } catch (error) {
            this.logger.error('Message delete error:', error);
        }
    }

    /**
     * Проверка истекающих аренд и отправка уведомлений
     */
    async checkExpiringRentals() {
        try {
            const expiringRentals = this.bot.database.getExpiringRentals(24); // Истекающие в течение 24 часов

            for (const rental of expiringRentals) {
                const timeLeft = moment(rental.endDate).fromNow();
                
                const message = `⚠️ *Внимание!*\n\nАренда бота в этой группе истекает ${timeLeft}.\n\n💰 Для продления обратитесь к администратору:\nwa.me/${this.config.bot.ownerNumber}\n\n🆔 ID группы: \`${rental.groupId}\``;
                
                await this.bot.sendMessage(rental.groupId, message);
                
                this.logger.rental(rental.groupId, 'expiration_warning', { timeLeft });
            }

        } catch (error) {
            this.logger.error('Check expiring rentals error:', error);
        }
    }

    /**
     * Очистка неактивных участников
     */
    async cleanupInactiveUsers(groupId, days = 90) {
        try {
            // Проверка доступа к группе
            if (!this.bot.hasGroupAccess(groupId)) {
                return;
            }

            const inactiveUsers = this.bot.database.getInactiveUsers(groupId, days);
            
            if (inactiveUsers.length === 0) {
                return;
            }

            // Уведомление администраторов
            const message = `📊 *Очистка неактивных участников*\n\nНайдено ${inactiveUsers.length} неактивных участников за ${days} дней.\n\nИспользуйте команду #неактивные для просмотра списка.`;
            
            await this.bot.sendMessage(groupId, message);
            
            this.logger.info(`Found ${inactiveUsers.length} inactive users in group ${groupId}`);

        } catch (error) {
            this.logger.error('Cleanup inactive users error:', error);
        }
    }

    /**
     * Автоматическое создание отчета активности
     */
    async generateActivityReport(groupId) {
        try {
            // Проверка доступа к группе
            if (!this.bot.hasGroupAccess(groupId)) {
                return;
            }

            const groupInfo = await this.bot.getGroupInfo(groupId);
            if (!groupInfo) return;

            const totalParticipants = groupInfo.participants.length;
            const activeWeek = totalParticipants - this.bot.database.getInactiveUsers(groupId, 7).length;
            const activeMonth = totalParticipants - this.bot.database.getInactiveUsers(groupId, 30).length;
            
            const rental = this.bot.database.getRental(groupId);
            
            let report = `📈 *Еженедельный отчет активности*\n\n`;
            report += `👥 Всего участников: ${totalParticipants}\n`;
            report += `✅ Активные за неделю: ${activeWeek} (${Math.round(activeWeek/totalParticipants*100)}%)\n`;
            report += `✅ Активные за месяц: ${activeMonth} (${Math.round(activeMonth/totalParticipants*100)}%)\n\n`;
            
            if (rental) {
                const timeLeft = moment(rental.endDate).fromNow();
                report += `💰 Аренда: ${rental.plan}\n`;
                report += `⏰ Истекает: ${timeLeft}\n\n`;
            }
            
            report += `🤖 Отчет сгенерирован ботом ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂`;

            await this.bot.sendMessage(groupId, report);
            
            this.logger.info(`Activity report generated for group ${groupId}`);

        } catch (error) {
            this.logger.error('Generate activity report error:', error);
        }
    }
}

module.exports = EventHandler; 