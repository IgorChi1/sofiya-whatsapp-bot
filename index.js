#!/usr/bin/env node

/**
 * ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ WhatsApp Bot
 * Система автоматической модерации с арендой
 * Оптимизирован для Termux
 * 
 * @version 1.0.0
 * @author Sofiya Bot Team
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');
const moment = require('moment');

// Импорт модулей
const SofiyaBot = require('./src/core/bot');
const Logger = require('./src/utils/logger');
const Database = require('./src/core/database');

// Глобальная конфигурация
const config = require('./config.json');
const logger = new Logger('MAIN');

/**
 * Создание необходимых директорий
 */
async function createDirectories() {
    const dirs = [
        'database',
        'logs', 
        'sessions',
        'src/core',
        'src/handlers',
        'src/plugins',
        'src/utils',
        'src/commands'
    ];

    for (const dir of dirs) {
        await fs.ensureDir(dir);
    }
}

/**
 * Инициализация базы данных
 */
async function initializeDatabase() {
    const db = new Database();
    await db.initialize();
    
    // Создание базовых JSON файлов если не существуют
    const dbFiles = {
        'database/groups.json': {},
        'database/users.json': {},
        'database/rentals.json': {},
        'database/settings.json': {},
        'database/activity.json': {}
    };

    for (const [file, defaultContent] of Object.entries(dbFiles)) {
        if (!await fs.pathExists(file)) {
            await fs.writeJson(file, defaultContent, { spaces: 2 });
        }
    }
}

/**
 * Отображение логотипа бота
 */
function displayLogo() {
    console.clear();
    
    const logo = figlet.textSync('SOFIYA', {
        font: 'Big',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    });

    console.log(chalk.magenta.bold(logo));
    console.log(chalk.cyan('━'.repeat(60)));
    console.log(chalk.yellow.bold(`  ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ WhatsApp Bot v${config.bot.version}`));
    console.log(chalk.cyan('━'.repeat(60)));
    console.log(chalk.green(`  📱 Платформа: Termux Optimized`));
    console.log(chalk.green(`  👥 Максимум групп: ${config.limits.maxGroups}`));
    console.log(chalk.green(`  💰 Система аренды: ${config.rental.enabled ? 'Активна' : 'Отключена'}`));
    console.log(chalk.green(`  🕐 Время запуска: ${moment().format('DD.MM.YYYY HH:mm:ss')}`));
    console.log(chalk.cyan('━'.repeat(60)));
    console.log();
}

/**
 * Обработка ошибок процесса
 */
function setupErrorHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection:', reason);
        console.log(chalk.red('🚨 Необработанная ошибка Promise:', reason));
    });

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        console.log(chalk.red('🚨 Необработанное исключение:', error.message));
        process.exit(1);
    });

    process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n🛑 Получен сигнал завершения...'));
        logger.info('Bot shutdown initiated');
        process.exit(0);
    });
}

/**
 * Основная функция запуска
 */
async function main() {
    try {
        // Отображение логотипа
        displayLogo();

        // Настройка обработчиков ошибок
        setupErrorHandlers();

        console.log(chalk.blue('🔧 Инициализация системы...'));
        
        // Создание директорий
        await createDirectories();
        console.log(chalk.green('✅ Директории созданы'));

        // Инициализация базы данных
        await initializeDatabase();
        console.log(chalk.green('✅ База данных инициализирована'));

        // Запуск бота
        console.log(chalk.blue('🤖 Запуск бота...'));
        const bot = new SofiyaBot(config);
        await bot.start();

        console.log(chalk.green.bold('🚀 Бот ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ успешно запущен!'));
        
        // Автоматический перезапуск каждые 24 часа
        if (config.limits.autoRestartHours > 0) {
            setTimeout(() => {
                console.log(chalk.yellow('🔄 Автоматический перезапуск...'));
                process.exit(0);
            }, config.limits.autoRestartHours * 60 * 60 * 1000);
        }

    } catch (error) {
        logger.error('Startup error:', error);
        console.log(chalk.red('❌ Ошибка запуска бота:', error.message));
        process.exit(1);
    }
}

// Запуск приложения
main(); 