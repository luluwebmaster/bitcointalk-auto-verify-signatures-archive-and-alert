#### Bitcointalk : Little bot to archive all messages from signature topic and alert if remove or edit message.

This script allows all those who wish to archive the messages of the subject "[Stake your Bitcoin address here](https://bitcointalk.org/index.php?topic=996318.10460)".

In addition to that, in case of modification or deletion of a message, you can choose to be alerted.

#### TODO

- Detect removed messages
- Add time after post before detect a update

#### How to use ?

To use this bot, you need to install [Node.JS](https://nodejs.org/).

First, clone this respository with `git clone https://github.com/luluwebmaster/bitcointalk-auto-verify-signatures-archive-and-alert.git`.

Install all packages with `npm install`.

Then, create a new screen `screen -S change-this-by-a-screen-name` and run node server inside the screen with `node app`.

#### How to see & share archived messages ?

You should know that after launching the bot, it is possible to automatically view archived messages by typing this URL in your browser :
- http://{your-vps-ip}:4269

Note that if you want to access this page from outside, you will have to open this port publicly.

#### How to configure ?

If this is the first time you have run the bot, you can either copy the `config.example.json` file to the `config.json` file, or else you can simply start the bot, the file will be automatically copied.

Then you can configure the file quite easily.

> ##### Configuration
>
> - `links -> bitcointalk -> stakeAddress` -> Is the link where the bot should search the messages.
> - `webServer -> enable` -> Enable / Disable Web access
> - `webServer -> port` -> Used port for see archived messages.
> - `webServer -> messagesPerPage` -> Archived messages per page loaded on page load and dynamique loading.
> - `timeInSecondsBetweenBttRequest` -> Time in seconds between each Bitcointalk requests.
> - `timeInHoursBetweenCheckAllMessages` -> Time in hours everytime the bot check all messages from subject.
> - `timeInSecondsBetweenCheckLastMessages` -> Time in seconds everytime the bot check all last messages from subject.
> - `email` -> Nodemailer configuration ( [More informations here](https://nodemailer.com/about/) )

#### Projects used in this project

- [Node.js](https://nodejs.org/)
- [Request](https://github.com/request/request)
- [Lowdb](https://github.com/typicode/lowdb)
- [Jsdom](https://github.com/jsdom/jsdom)
- [Express](https://expressjs.com/)
- [NodeMailer](https://nodemailer.com/)
- [Jquery](https://jquery.com/)
- [Bootstrap](https://getbootstrap.com/)

#### Donate

- Bitcoin : 1DSXQn7AankhmXUvExfZBbo8zWa3ie3jXc

#### Contact

- Mail : contact@luc-mergault.fr
- Twitter : [@Luluwebmaster](https://twitter.com/Luluwebmaster)
