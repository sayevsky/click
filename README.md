click
=====

Скрипт мониторит баланс счетов в Альфа-Клике и сообщает об изменении письмом.
##Установка

```
npm install request
npm install nconf
npm install cheerio
npm install winston
npm install nodemailer
```
Меняем имя конфига
```
mv configSample.json config.json
```
и значения параметров на свои.

Запускаем
```
node click.js
```

Enjoy.
