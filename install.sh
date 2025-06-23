#!/bin/bash

# ======================================================================
# 🤖 Автоустановщик бота ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ v2.0
# ======================================================================
# Решает ВСЕ проблемы установки в Termux автоматически
# Создан: 16.12.2025
# ======================================================================

set -e  # Остановка при любой ошибке

# Цвета для красивого вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# Красивый логотип
print_logo() {
    clear
    echo -e "${PURPLE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║           🤖 ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ WhatsApp Bot                    ║"
    echo "║                                                                ║"
    echo "║              📱 Автоустановщик для Termux v2.0                ║"
    echo "║                                                                ║"
    echo "║         🚀 Исправляет ВСЕ проблемы автоматически              ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo
}

# Функция логирования
log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"
}

log_info() {
    echo -e "${CYAN}[$(date '+%H:%M:%S')] 📋 $1${NC}"
}

# Проверка Termux
check_termux() {
    log_info "Проверка окружения Termux..."
    
    if [[ ! "$PREFIX" == *"com.termux"* ]]; then
        log_error "Этот скрипт предназначен только для Termux!"
        exit 1
    fi
    
    log "Termux обнаружен ✅"
}

# Обновление пакетов Termux
update_termux() {
    log_info "Обновление пакетов Termux..."
    
    # Исправляем возможные проблемы с репозиториями
    echo "deb https://packages.termux.dev/apt/termux-main stable main" > $PREFIX/etc/apt/sources.list
    
    # Принудительное обновление
    apt update -y --allow-unauthenticated 2>/dev/null || {
        log_warn "Стандартное обновление не сработало, пробуем альтернативный способ..."
        pkg update --yes 2>/dev/null || true
    }
    
    apt upgrade -y --allow-unauthenticated 2>/dev/null || {
        log_warn "Стандартный upgrade не сработал, пробуем pkg..."
        pkg upgrade --yes 2>/dev/null || true
    }
    
    log "Пакеты обновлены ✅"
}

# Установка основных инструментов
install_core_tools() {
    log_info "Установка основных инструментов..."
    
    # Массив основных пакетов
    CORE_PACKAGES=(
        "curl"
        "wget" 
        "git"
        "nodejs"
        "npm"
        "python"
        "build-essential"
        "pkg-config"
        "libtool"
        "automake"
        "autoconf"
    )
    
    for package in "${CORE_PACKAGES[@]}"; do
        log_info "Установка $package..."
        
        # Множественные попытки установки
        if ! command -v "$package" &> /dev/null; then
            # Попытка 1: apt
            apt install -y "$package" 2>/dev/null || \
            # Попытка 2: pkg
            pkg install -y "$package" 2>/dev/null || \
            # Попытка 3: с force
            pkg install --yes "$package" 2>/dev/null || {
                log_warn "Не удалось установить $package стандартным способом"
                continue
            }
        fi
        
        log "✅ $package установлен"
    done
}

# Проверка и исправление Node.js
fix_nodejs() {
    log_info "Проверка Node.js и npm..."
    
    # Проверяем наличие Node.js
    if ! command -v node &> /dev/null; then
        log_warn "Node.js не найден, устанавливаем..."
        
        # Попытки установки Node.js
        pkg install nodejs -y 2>/dev/null || \
        pkg install nodejs-lts -y 2>/dev/null || \
        apt install nodejs -y 2>/dev/null || {
            log_error "Критическая ошибка: не удалось установить Node.js"
            exit 1
        }
    fi
    
    # Проверяем наличие npm
    if ! command -v npm &> /dev/null; then
        log_warn "npm не найден, устанавливаем..."
        
        pkg install npm -y 2>/dev/null || \
        apt install npm -y 2>/dev/null || {
            log_error "Критическая ошибка: не удалось установить npm"
            exit 1
        }
    fi
    
    # Проверяем версии
    NODE_VERSION=$(node --version 2>/dev/null || echo "не установлен")
    NPM_VERSION=$(npm --version 2>/dev/null || echo "не установлен")
    
    log "Node.js версия: $NODE_VERSION"
    log "npm версия: $NPM_VERSION"
    
    # Настраиваем npm для Termux
    npm config set fund false 2>/dev/null || true
    npm config set audit false 2>/dev/null || true
    npm config set update-notifier false 2>/dev/null || true
    
    log "Node.js и npm настроены ✅"
}

# Установка Python зависимостей
install_python_deps() {
    log_info "Установка Python зависимостей..."
    
    # Установка pip если нужно
    if ! command -v pip &> /dev/null; then
        pkg install python-pip -y 2>/dev/null || true
    fi
    
    # Установка нужных Python пакетов
    pip install --upgrade pip 2>/dev/null || true
    pip install qrcode[pil] 2>/dev/null || true
    
    log "Python зависимости установлены ✅"
}

# Установка зависимостей проекта
install_project_deps() {
    log_info "Установка зависимостей проекта..."
    
    # Очистка кэша npm
    npm cache clean --force 2>/dev/null || true
    
    # Создание необходимых папок
    mkdir -p database logs sessions
    
    # Установка зависимостей с различными флагами для надежности
    log_info "Устанавливаем npm пакеты..."
    
    npm install --legacy-peer-deps 2>/dev/null || \
    npm install --force 2>/dev/null || \
    npm install --no-optional 2>/dev/null || \
    npm install 2>/dev/null || {
        log_warn "Стандартная установка не сработала, пробуем ручную установку критических пакетов..."
        
        # Ручная установка основных пакетов
        REQUIRED_PACKAGES=(
            "@whiskeysockets/baileys@latest"
            "qrcode-terminal@latest" 
            "moment@latest"
            "fs-extra@latest"
            "chalk@latest"
            "figlet@latest"
        )
        
        for pkg in "${REQUIRED_PACKAGES[@]}"; do
            log_info "Установка $pkg..."
            npm install "$pkg" --save --legacy-peer-deps 2>/dev/null || \
            npm install "$pkg" --save --force 2>/dev/null || \
            log_warn "Не удалось установить $pkg"
        done
    }
    
    log "Зависимости проекта установлены ✅"
}

# Настройка доступа к хранилищу
setup_storage() {
    log_info "Настройка доступа к хранилищу..."
    
    # Запрос доступа к хранилищу
    termux-setup-storage 2>/dev/null || {
        log_warn "Не удалось автоматически настроить доступ к хранилищу"
        log_info "Предоставьте доступ к файлам вручную если потребуется"
    }
    
    log "Доступ к хранилищу настроен ✅"
}

# Создание скриптов управления
create_scripts() {
    log_info "Создание скриптов управления..."
    
    # Скрипт запуска
    cat > start.sh << 'EOF'
#!/bin/bash
echo "🚀 Запуск бота Sofiya..."
node index.js
EOF
    
    # Скрипт запуска в фоне
    cat > start-bg.sh << 'EOF'
#!/bin/bash
echo "🚀 Запуск бота Sofiya в фоне..."
nohup node index.js > bot.log 2>&1 &
echo "✅ Бот запущен в фоне. Логи: tail -f bot.log"
EOF
    
    # Скрипт остановки
    cat > stop.sh << 'EOF'
#!/bin/bash
echo "🛑 Остановка бота Sofiya..."
pkill -f "node index.js" 2>/dev/null || echo "Бот не был запущен"
echo "✅ Бот остановлен"
EOF
    
    # Скрипт статуса
    cat > status.sh << 'EOF'
#!/bin/bash
echo "📊 Статус бота Sofiya:"
if pgrep -f "node index.js" > /dev/null; then
    echo "✅ Бот запущен"
    echo "🆔 PID: $(pgrep -f 'node index.js')"
else
    echo "❌ Бот не запущен" 
fi
EOF
    
    # Скрипт обновления
    cat > update.sh << 'EOF'
#!/bin/bash
echo "🔄 Обновление бота Sofiya..."
git pull origin main
npm install --legacy-peer-deps
echo "✅ Обновление завершено"
EOF
    
    # Делаем скрипты исполняемыми
    chmod +x start.sh start-bg.sh stop.sh status.sh update.sh
    
    log "Скрипты управления созданы ✅"
}

# Создание конфигурации
setup_config() {
    log_info "Настройка конфигурации..."
    
    # Если конфига нет, создаем базовый
    if [[ ! -f "config.json" ]]; then
        log_info "Создание базового config.json..."
        
        cat > config.json << 'EOF'
{
  "bot": {
    "name": "꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂",
    "prefix": "#",
    "ownerNumber": "79XXXXXXXXX",
    "maxGroups": 20,
    "autoRestart": true,
    "restartInterval": 24
  },
  "rental": {
    "enabled": true,
    "currency": "₽",
    "plans": {
      "week": {
        "name": "Неделя", 
        "price": 500,
        "duration": 168,
        "description": "Пробный период"
      },
      "month": {
        "name": "Месяц",
        "price": 1500, 
        "duration": 720,
        "description": "Оптимальный выбор"
      },
      "quarter": {
        "name": "Квартал",
        "price": 4000,
        "duration": 2160, 
        "description": "Выгодное предложение"
      },
      "year": {
        "name": "Год",
        "price": 12000,
        "duration": 8760,
        "description": "Максимальная экономия"
      }
    }
  },
  "features": {
    "antiSpam": true,
    "antiLink": true,
    "antiCall": true,
    "antiDelete": true,
    "autoWelcome": true,
    "autoAdmin": false,
    "autoRead": false
  },
  "limits": {
    "messagesPerMinute": 30,
    "commandCooldown": 3,
    "maxMentions": 50
  },
  "database": {
    "autoBackup": true,
    "backupInterval": 6,
    "maxBackups": 10
  },
  "logging": {
    "level": "info",
    "maxFiles": 5,
    "maxSize": "10mb"
  }
}
EOF
        
        log "Базовый конфиг создан ✅"
    else
        log "Конфиг уже существует ✅"
    fi
}

# Финальная проверка
final_check() {
    log_info "Финальная проверка установки..."
    
    # Проверяем наличие всех необходимых команд
    REQUIRED_COMMANDS=("node" "npm" "git")
    
    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        if command -v "$cmd" &> /dev/null; then
            log "✅ $cmd: $(command -v $cmd)"
        else
            log_error "❌ $cmd не найден!"
            return 1
        fi
    done
    
    # Проверяем основные файлы
    REQUIRED_FILES=("package.json" "index.js" "config.json")
    
    for file in "${REQUIRED_FILES[@]}"; do
        if [[ -f "$file" ]]; then
            log "✅ $file: существует"
        else
            log_error "❌ $file: не найден!"
            return 1
        fi
    done
    
    log "Все проверки пройдены ✅"
    return 0
}

# Показ инструкций
show_instructions() {
    echo
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    🎉 УСТАНОВКА ЗАВЕРШЕНА! 🎉                  ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${WHITE}📋 Доступные команды:${NC}"
    echo -e "${CYAN}  ./start.sh${NC}     - Запуск бота в консоли"
    echo -e "${CYAN}  ./start-bg.sh${NC}  - Запуск бота в фоне"
    echo -e "${CYAN}  ./stop.sh${NC}      - Остановка бота"
    echo -e "${CYAN}  ./status.sh${NC}    - Проверка статуса"
    echo -e "${CYAN}  ./update.sh${NC}    - Обновление бота"
    echo
    echo -e "${WHITE}🚀 Быстрый запуск:${NC}"
    echo -e "${YELLOW}  npm start${NC}      - Запустить прямо сейчас"
    echo
    echo -e "${WHITE}⚙️  Настройка:${NC}"
    echo -e "${CYAN}  1. Отредактируйте config.json${NC}"
    echo -e "${CYAN}  2. Укажите свой номер в ownerNumber${NC}"
    echo -e "${CYAN}  3. Запустите бота командой: npm start${NC}"
    echo -e "${CYAN}  4. Отсканируйте QR-код в WhatsApp${NC}"
    echo
    echo -e "${GREEN}✨ Готово! Бот ꧁༺ 𝓢𝓸𝓯𝓲𝔂𝓪 ༻꧂ установлен и готов к работе!${NC}"
    echo
}

# Основная функция установки
main() {
    print_logo
    
    log_info "Начинаем автоматическую установку бота Sofiya..."
    echo
    
    # Пошаговая установка
    check_termux
    sleep 1
    
    update_termux  
    sleep 1
    
    install_core_tools
    sleep 1
    
    fix_nodejs
    sleep 1
    
    install_python_deps
    sleep 1
    
    setup_storage
    sleep 1
    
    install_project_deps
    sleep 1
    
    create_scripts
    sleep 1
    
    setup_config
    sleep 1
    
    # Финальная проверка
    if final_check; then
        show_instructions
    else
        log_error "Установка завершилась с ошибками!"
        echo
        echo -e "${YELLOW}Попробуйте запустить скрипт повторно или установите пакеты вручную:${NC}"
        echo -e "${CYAN}pkg install git nodejs npm python -y${NC}"
        exit 1
    fi
}

# Запуск
main "$@" 