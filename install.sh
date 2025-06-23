#!/bin/bash

# ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ WhatsApp Bot - Автоматическая установка для Termux
# Версия: 1.0.0

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Функция для красивого вывода
print_banner() {
    clear
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                  ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂                           ║"
    echo "║              WhatsApp Bot Installer v1.0               ║"
    echo "║          Оптимизирован для Termux | До 20 групп             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Функция для логирования
log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Проверка запуска в Termux
check_termux() {
    if [[ ! "$PREFIX" == *"com.termux"* ]]; then
        error "Этот скрипт предназначен для Termux!"
    fi
    log "✅ Termux обнаружен"
}

# Проверка и установка зависимостей
install_dependencies() {
    log "🔧 Обновление пакетов Termux..."
    pkg update -y || error "Ошибка обновления пакетов"
    
    log "📦 Установка базовых зависимостей..."
    pkg install -y nodejs npm git python || error "Ошибка установки базовых пакетов"
    
    # Проверка версии Node.js
    NODE_VERSION=$(node --version | sed 's/v//')
    REQUIRED_VERSION="16.0.0"
    
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
        log "✅ Node.js $NODE_VERSION установлен (требуется $REQUIRED_VERSION+)"
    else
        error "❌ Требуется Node.js $REQUIRED_VERSION или выше, установлена версия $NODE_VERSION"
    fi
}

# Настройка доступа к хранилищу
setup_storage() {
    log "📱 Настройка доступа к хранилищу..."
    if [ ! -d "$HOME/storage" ]; then
        termux-setup-storage
        sleep 2
    fi
    log "✅ Доступ к хранилищу настроен"
}

# Клонирование или загрузка бота
setup_bot() {
    log "💾 Настройка бота Sofiya..."
    
    # Создание директории если не существует
    BOT_DIR="$HOME/sofiya-bot"
    if [ -d "$BOT_DIR" ]; then
        warn "Директория $BOT_DIR уже существует. Создаю резервную копию..."
        mv "$BOT_DIR" "$BOT_DIR.backup.$(date +%s)"
    fi
    
    mkdir -p "$BOT_DIR"
    cd "$BOT_DIR"
    
    log "📦 Установка зависимостей бота..."
    
    # Установка зависимостей напрямую
    npm init -y || error "Ошибка инициализации npm"
    
    npm install @whiskeysockets/baileys@^6.6.0 \
                qrcode-terminal@^0.12.0 \
                fs-extra@^11.1.1 \
                moment@^2.29.4 \
                node-cron@^3.0.3 \
                axios@^1.6.0 \
                chalk@^4.1.2 \
                figlet@^1.7.0 \
                uuid@^9.0.1 || error "Ошибка установки зависимостей"
    
    log "✅ Зависимости установлены"
}

# Создание конфигурации
create_config() {
    log "⚙️ Создание конфигурации..."
    
    echo -e "${CYAN}Настройка бота:${NC}"
    
    # Запрос номера владельца
    while true; do
        echo -n "📱 Введите номер владельца (например: 79123456789): "
        read OWNER_NUMBER
        
        if [[ $OWNER_NUMBER =~ ^[0-9]{11,15}$ ]]; then
            break
        else
            warn "Неверный формат номера. Введите номер в формате 79123456789"
        fi
    done
    
    # Выбор валюты
    echo -e "${CYAN}Выберите валюту для аренды:${NC}"
    echo "1) RUB (₽)"
    echo "2) USD ($)"
    echo "3) EUR (€)"
    echo -n "Выберите (1-3): "
    read CURRENCY_CHOICE
    
    case $CURRENCY_CHOICE in
        1) CURRENCY="RUB" ;;
        2) CURRENCY="USD" ;;
        3) CURRENCY="EUR" ;;
        *) CURRENCY="RUB" ;;
    esac
    
    # Создание config.json
    cat > config.json << EOF
{
  "bot": {
    "name": "꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂",
    "version": "1.0.0",
    "prefix": ".",
    "ownerNumber": "$OWNER_NUMBER",
    "language": "ru"
  },
  "limits": {
    "maxGroups": 20,
    "messagesPerMinute": 30,
    "commandsPerUser": 10,
    "maxFileSize": 52428800,
    "autoRestartHours": 24
  },
  "rental": {
    "enabled": true,
    "currency": "$CURRENCY",
    "defaultTrial": 72,
    "plans": {
      "week": {
        "name": "Неделя",
        "duration": 168,
        "price": 500
      },
      "month": {
        "name": "Месяц",
        "duration": 720,
        "price": 1500
      },
      "quarter": {
        "name": "3 месяца",
        "duration": 2160,
        "price": 4000
      },
      "year": {
        "name": "Год",
        "duration": 8760,
        "price": 12000
      }
    }
  },
  "features": {
    "antiSpam": {
      "antiLink": true,
      "antiLink2": true,
      "antiCall": true,
      "antiPrivate": true,
      "antiDelete": true
    },
    "moderation": {
      "autoAdmin": true,
      "welcome": true,
      "restrict": true,
      "autoRead": true,
      "activityCheck": true
    },
    "analytics": {
      "enabled": true,
      "inactiveThreshold": 7,
      "silentThreshold": 30
    }
  },
  "database": {
    "autoBackup": true,
    "backupInterval": 6,
    "cleanupDays": 30
  },
  "security": {
    "rateLimiting": true,
    "spamThreshold": 5,
    "bannedWords": ["спам", "реклама"],
    "trustedUsers": []
  }
}
EOF
    
    log "✅ Конфигурация создана"
}

# Создание скриптов запуска
create_scripts() {
    log "📝 Создание скриптов запуска..."
    
    # Скрипт запуска
    cat > start.sh << 'EOF'
#!/bin/bash

# Скрипт запуска Sofiya Bot
cd "$(dirname "$0")"

echo "🤖 Запуск бота ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂..."

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не найден! Установите Node.js командой: pkg install nodejs"
    exit 1
fi

# Создание директорий
mkdir -p database logs sessions

# Запуск бота
node index.js
EOF
    
    # Скрипт фонового запуска
    cat > start-background.sh << 'EOF'
#!/bin/bash

# Скрипт фонового запуска Sofiya Bot
cd "$(dirname "$0")"

echo "🤖 Запуск бота ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ в фоне..."

# Остановка существующего процесса
pkill -f "node index.js" 2>/dev/null || true

# Создание директорий
mkdir -p database logs sessions

# Запуск в фоне
nohup node index.js > bot.log 2>&1 &

echo "✅ Бот запущен в фоне. PID: $!"
echo "📋 Для просмотра логов: tail -f bot.log"
echo "🛑 Для остановки: pkill -f 'node index.js'"
EOF
    
    # Скрипт остановки
    cat > stop.sh << 'EOF'
#!/bin/bash

echo "🛑 Остановка бота Sofiya..."
pkill -f "node index.js" && echo "✅ Бот остановлен" || echo "❌ Бот не запущен"
EOF
    
    # Скрипт обновления
    cat > update.sh << 'EOF'
#!/bin/bash

echo "🔄 Обновление бота Sofiya..."

# Создание бэкапа
if [ -d "database" ]; then
    cp -r database database.backup.$(date +%s)
    echo "✅ Создан бэкап базы данных"
fi

# Обновление зависимостей
npm update
echo "✅ Зависимости обновлены"

echo "🔄 Перезапуск бота..."
./stop.sh
sleep 2
./start-background.sh
EOF
    
    # Права на выполнение
    chmod +x start.sh start-background.sh stop.sh update.sh
    
    log "✅ Скрипты созданы"
}

# Финальная настройка
final_setup() {
    log "🎯 Финальная настройка..."
    
    # Создание базовых директорий
    mkdir -p database logs sessions
    
    # Создание пустых файлов базы данных
    echo '{}' > database/groups.json
    echo '{}' > database/users.json
    echo '{}' > database/rentals.json
    echo '{}' > database/settings.json
    echo '{}' > database/activity.json
    
    # Информация о завершении
    echo
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                     УСТАНОВКА ЗАВЕРШЕНА!                    ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${CYAN}📁 Бот установлен в: $BOT_DIR${NC}"
    echo -e "${CYAN}👤 Владелец: $OWNER_NUMBER${NC}"
    echo -e "${CYAN}💰 Валюта: $CURRENCY${NC}"
    echo
    echo -e "${YELLOW}🚀 КОМАНДЫ УПРАВЛЕНИЯ:${NC}"
    echo -e "${BLUE}  ./start.sh${NC}             - Запуск бота"
    echo -e "${BLUE}  ./start-background.sh${NC}  - Запуск в фоне"
    echo -e "${BLUE}  ./stop.sh${NC}              - Остановка бота"
    echo -e "${BLUE}  ./update.sh${NC}            - Обновление бота"
    echo
    echo -e "${YELLOW}📋 ПОЛЕЗНЫЕ КОМАНДЫ:${NC}"
    echo -e "${BLUE}  tail -f bot.log${NC}        - Просмотр логов"
    echo -e "${BLUE}  ps aux | grep node${NC}     - Проверка процесса"
    echo
    echo -e "${GREEN}✅ Для запуска бота выполните: ./start.sh${NC}"
    echo
}

# Основная функция
main() {
    print_banner
    
    log "🚀 Начинаю установку бота ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂..."
    
    check_termux
    install_dependencies
    setup_storage
    setup_bot
    create_config
    create_scripts
    final_setup
    
    log "🎉 Установка успешно завершена!"
}

# Запуск скрипта
main "$@" 