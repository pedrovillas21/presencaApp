FROM php:8.2-apache AS php-base

ENV PORT=80

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      curl \
      libcurl4-openssl-dev \
      libfreetype6-dev \
      libicu-dev \
      libjpeg62-turbo-dev \
      libonig-dev \
      libpng-dev \
      libxml2-dev \
      libzip-dev \
      unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
      curl \
      dom \
      gd \
      intl \
      mbstring \
      mysqli \
      pdo \
      pdo_mysql \
      zip \
    && a2enmod headers rewrite \
    && sed -ri 's!Listen 80!Listen ${PORT}!' /etc/apache2/ports.conf \
    && sed -ri 's!<VirtualHost \*:80>!<VirtualHost *:${PORT}>!' /etc/apache2/sites-available/*.conf \
    && sed -ri 's!/var/www/html!/var/www/html/public!g' \
      /etc/apache2/sites-available/*.conf \
      /etc/apache2/apache2.conf \
      /etc/apache2/conf-available/*.conf \
    && printf '%s\n' \
      'expose_php=Off' \
      'memory_limit=384M' \
      'max_execution_time=120' \
      > /usr/local/etc/php/conf.d/presenca-app.ini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

FROM php-base AS build
WORKDIR /app

ARG APP_ENV=prod
ENV APP_ENV=${APP_ENV}

COPY composer.json composer.lock ./
RUN if [ "$APP_ENV" = "prod" ]; then \
      composer install --no-dev --no-interaction --no-progress --prefer-dist; \
    else \
      composer install --no-interaction --no-progress --prefer-dist; \
    fi

COPY public ./public
COPY src ./src
COPY tests ./tests
RUN if [ "$APP_ENV" = "prod" ]; then \
      composer dump-autoload --no-dev --classmap-authoritative; \
    else \
      composer dump-autoload --classmap-authoritative; \
    fi \
    && composer check

FROM php-base AS runtime
WORKDIR /var/www/html

ARG APP_ENV=prod
ENV APP_ENV=${APP_ENV}

COPY --from=build /app/composer.json /app/composer.lock ./
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY docker/zz-presenca-security.conf /etc/apache2/conf-available/zz-presenca-security.conf

RUN a2enconf zz-presenca-security \
    && chown -R www-data:www-data /var/www/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl --fail --silent --show-error "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["apache2-foreground"]
