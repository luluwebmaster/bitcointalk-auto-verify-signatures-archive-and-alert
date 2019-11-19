
/*************************************************************************************************************************/
/*************************************************************************************************************************/
/*    This script allows all those who wish to archive the messages of the subject "Stake your Bitcoin address here".    */
/*         In addition to that, in case of modifications or deletion of a message, you can choose to be alerted.         */
/*                The code is voluntarily well commented in order to make easier the understanding of it.                */
/*************************************************************************************************************************/
/*************************************************************************************************************************/

// Load modules
const Fs = require('fs');
const Jquery = require('jquery');
const Jsdom = require('jsdom');
const Request = require('request');
const Express = require('express');
const Nodemailer = require('nodemailer');
const Lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// If config file is not created
if(!Fs.existsSync('./config/config.json')) {

    // Copy example config
    Fs.copyFileSync('./config/config.example.json', './config/config.json', function () {});
}

// App config
const configExample = require('./config/config.example.json');
let config = require('./config/config.json');

// App version
const appVersions = require('./config/versions.json');

// Init Bitcointalk cookies ( Jar )
const bitcointalkCookies = Request.jar();

// Function for merge object with other
const mergeObjectProperties = function(object, objectToMerge) {

    // Loop in object to merge propertie
    for(const index in objectToMerge) {

        // If current object don't have this property
        if(object[index] == undefined) {

            // Add property
            object[index] = objectToMerge[index];
        } else if(object[index] !== undefined && typeof object[index] == 'object') {

            // Update property
            object[index] = mergeObjectProperties(object[index], objectToMerge[index]);
        }
    }

    // Return current object
    return object;
};

// Merge config example with current
config = mergeObjectProperties(config, configExample);

// Save config
Fs.writeFileSync('./config/config.json', JSON.stringify(config, null, '\t'));

// App variables
const webApp = Express();
if(config.email.enable) {
    let mailTransporter = Nodemailer.createTransport(config.email);
}
const originalConsolLog = console.log;
let lastBttRequest = 0;

// Init low database
const adapterDb = new FileSync('./config/db.json');
const db = Lowdb(adapterDb);
const adapterDbUpdatable = new FileSync('./config/db.updatable.json');
const dbUpdatable = Lowdb(adapterDbUpdatable);

// Function for log messages
console.log = function (log) {

    const today = new Date();

    if(typeof log === 'string') {

        originalConsolLog(today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate()+' '+today.getHours()+':'+today.getMinutes()+':'+today.getSeconds()+' > '+log);
    } else {

        originalConsolLog(log);
    }
}

// Set default values
db.defaults({
    messages: {}
}).write();
db.set('canCheckLast', false).write();
dbUpdatable.defaults({
    messages: {}
}).write();

// If new version
if(!db.has('appVersions').value() || db.get('appVersions').value() !== appVersions.versions) {

    // Set need to reset status
    let needToResetDb = false;

    // List of versions needing to reset the database
    const needingVersionResetDb = [];

    // Loop in all versions
    for(const version in appVersions) {

        // Check if need to reset DB
        if(db.has('appVersions').value() && !db.get('appVersions').has(version).value() && appVersions[version].needToResetDb) {

            // Add versions in list needing reset
            needingVersionResetDb.push(version);

            // Set need to reset db status
            needToResetDb = true;
        }
    }

    // If need to reset db
    if(needToResetDb) {

        // Log
        console.log('Reset DB to use new version : '+needingVersionResetDb.join(', '));

        // Reset messages
        db.set('messages', false).write();
        db.set('messages', {}).write();
    }

    // Save versions
    db.set('appVersions', appVersions).write();
}

// Function for format message
const stripHtmlFromMessage = function (message) {

    message = message.replace(/<br \/>/gm, '[back-line]').replace(/<br\/>/gm, '[back-line]').replace(/<br>/gm, '[back-line]').replace(/<\/p>/gm, '[back-line]').replace(/<p>/gm, '');
    message = message.replace(/<[^>]+>/g, '');

    return message.replace(/\[back-line\]/gm, '<br />');
}

// Function for get time
const getTime = function () {

    // Return date
    return (new Date()).getTime();
}

// Function for make loop taking into account async functions
const setLoop = async function (customFunction, time) {

    // Save called time
    const calledAt = getTime();

    // Execute custom function
    const asyncFunction = async function () {
        return new Promise(async function (resolve) {
            await customFunction(resolve);
        });
    }
    await asyncFunction();

    // if can execute next
    if((calledAt + time) <= (new Date()).getTime()) {

        // Call this function
        setLoop(customFunction, time);
    } else {

        // Wait time
        setTimeout(function () {

            // Call this function
            setLoop(customFunction, time);
        }, ((calledAt + time) - (new Date()).getTime()));
    }
}

// Function for init dom from text string
const getDom = function (text) {

    // Init dom
    const { JSDOM } = Jsdom;
    const { window } = new JSDOM();
    const { document } = (new JSDOM(text)).window;
    const jquery = Jquery(window);

    // Return infos
    return {
        document: document,
        jquery: jquery
    };
}

// Function for execute Bitcointalk request
const executeBttRequest = function (link, form = null, jar = null) {

    // Return promise
    return new Promise(async function (resolve) {

        // Function for execute request
        const executeRequest = function () {

            // Log
            console.log('Execute BTT request : '+link);

            // Save last btt request time
            lastBttRequest = getTime();

            // If is post
            if(form) {

                // Execute request
                Request.post({
                    url: link,
                    form: form,
                    jar: jar
                }, function (error, response, body) {

                    // Return page response and body
                    resolve({
                        body: body,
                        response: response
                    });
                });
            } else {

                // Return page response and body
                Request.get({
                    url: link,
                    jar: jar
                }, function (error, response, body) {

                    // Return page body
                    resolve({
                        body: body,
                        response: response
                    });
                });
            }
        }

        // If can execute request
        if((lastBttRequest + (config.timeInSecondsBetweenBttRequest * 1000)) < getTime()) {

            // Execute request
            await executeRequest();
        } else {

            // Wait timeout
            setTimeout(async function () {

                // Execute request
                await executeRequest();
            }, ((lastBttRequest + (config.timeInSecondsBetweenBttRequest * 1000)) - getTime()));
        }
    });
}

// Function for send alert on Bitcointalk topic
const sendBitcointalkAlert = function (title, message) {

    // Return promise
    return new Promise(async function (resolve) {

        // If Bitcointalk alerts enable
        if(config.bitcointalk.enable) {

            // Replace br in messages
            message = message.replace(/<br \/>/gm, '\n');

            // Execute first request for get form informations ( Session )
            let formInformations = await executeBttRequest(config.links.bitcointalk.getPostAlertDetails+';topic='+config.bitcointalk.topicId, null, bitcointalkCookies);

            // Send alert
            var test = await executeBttRequest(config.links.bitcointalk.postAlert, {
                topic: config.bitcointalk.topicId,
                subject: title,
                icon: 'xx',
                message: message,
                notify: 0,
                notify: 1,
                do_watch: 0,
                do_watch: 1,
                lock: 0,
                goback: 1,
                post: 'Post',
                num_replies: formInformations.body.match(/<input type="hidden" name="num_replies" value="(.*)" \/>/)[1],
                additional_options: 0,
                sc: formInformations.body.match(/<input type="hidden" name="sc" value="(.*)" \/>/)[1],
                seqnum: formInformations.body.match(/<input type="hidden" name="seqnum" value="(.*)" \/>/)[1]
            }, bitcointalkCookies);
        }

        // Resolve
        resolve();
    });
}

// Function for get pages number
const getPagesNumber = function () {

    // Return promise
    return new Promise(async function (resolve) {

        // Get page content
        let pageContent = await executeBttRequest(config.links.bitcointalk.stakeAddress);
        pageContent = pageContent.body;

        // Init dom
        const dom = getDom(pageContent);
        const document = dom.document;
        const $ = dom.jquery;

        // Get pages number
        const pagesNumber = $(document).find('.navPages').eq(-2).text().trim();

        // Log
        console.log(pagesNumber+' pages found in the topic.');

        // Return number
        resolve(pagesNumber);
    });
}

// Function for get messages from page
const getMessagesFromPage = function (page = 'last') {

    // Return promise
    return new Promise(async function (resolve) {

        // Get page content
        let pageContent = await executeBttRequest(config.links.bitcointalk.stakeAddress+((page == 'last') ? '.new;topicseen#new' : '.'+((page - 1)*20)));
        pageContent = pageContent.body;

        // Init dom
        const dom = getDom(pageContent);
        const document = dom.document;
        const $ = dom.jquery;

        // Get dom messages
        const domMessages = $(document).find('.windowbg .message_number, .windowbg2 .message_number').closest('.windowbg, .windowbg2');
        const messages = {};

        // Loop in all dom messages
        domMessages.each(function () {

            // Set current date
            const currentDate = new Date();
            const currentTextDate = currentDate.getFullYear()+'-'+(currentDate.getMonth()+1)+'-'+("0" + currentDate.getDate()).slice(-2);

            // Get message infos
            let domMessage = $(this).find('.post').html();
            const username = $(this).find('.poster_info > b > a').first().text().trim();
            const messageId = $(this).find('.message_number').attr('href').match(/#[a-z0-9_]+/gi)[0].replace('#', '');
            let originalPostDate = $(this).find('.td_headerandpost td[valign=middle]:nth-child(2) .smalltext .edited');
            originalPostDate = ((originalPostDate.length) ? originalPostDate : $(this).find('.td_headerandpost td[valign=middle]:nth-child(2) .smalltext').first()).text().replace('Today at', currentTextDate);
            originalPostDate = new Date((!isNaN(originalPostDate)) ? (originalPostDate * 1000) : originalPostDate).getTime();
            let originalEditDate = $(this).find('.td_headerandpost td[valign=middle]:nth-child(2) .smalltext .edited').attr('title');
            originalEditDate = new Date(((originalEditDate) ? originalEditDate.match(/Last edit: (.*) by (.*)/)[1].replace('Today at', currentTextDate) : 0)).getTime();
            const originalQuoteDate = $(this).find('.quoteheader a');

            // Loop in all quotes
            originalQuoteDate.each(function () {

                // Set current quote date
                let currentQuoteDate = $(this).html().match(/Quote from: (.*) on (.*)/);

                // If quote found
                if(currentQuoteDate) {

                    // Set quote
                    currentQuoteDate = currentQuoteDate[2];

                    // Replace regex
                    const replaceRegex = new RegExp(currentQuoteDate, 'gm');

                    // Replace today quotes in dom message
                    domMessage = domMessage.replace(replaceRegex, 'unix time : '+(new Date(currentQuoteDate.replace('<b>Today</b>', currentTextDate)).getTime() / 1000));
                }
            });

            // If message element is a real message
            if(isNaN(username) && isNaN(domMessage)) {

                // Add message to final list
                messages[messageId] = {
                    messageId: messageId,
                    number: $(this).find('.message_number').text().replace('#', ''),
                    link: $(this).find('.message_number').attr('href'),
                    fullText: domMessage,
                    user: {
                        name: username,
                        profileLink: $(this).find('.poster_info > b > a').first().attr('href')
                    },
                    dates: {
                        message: originalPostDate,
                        edit: originalEditDate
                    }
                };
            }
        });

        // Return all messages
        resolve(messages);
    });
}

// Function for check message is removed
const checkIfMessageRemoved = function () {

    // Return promise
    return new Promise(async function (resolve) {

        // Get all messages
        const allMessages = db.get('messages').value();

        // Get all updatables messages
        const allUpdatablesMessages = dbUpdatable.get('messages').value();

        // Set final list of removed messages
        const allRemovedMessages = [];

        // Loop in all messages
        for(const index in allMessages) {

            // If message is not in updatables messages
            if(!allUpdatablesMessages[index] && !allMessages[index].removedAlertSent) {

                // Set message
                const message = allMessages[index];

                // Log
                console.log('Alert | A message from '+message.user.name+' has been removed : '+message.link);

                // Update message alert status
                db.get('messages').get(index).set('removedAlertSent', true).write();

                // Push message in removed list
                allRemovedMessages.push(message);
            }
        }

        // Resolve with removed messages list
        resolve(allRemovedMessages);
    });
}

// Function for checking all messages
const checkingAllMessages = function () {

    // Return promise
    return new Promise(async function (resolve) {

        // Log
        console.log('Starting checking DB messages ...');

        // Get page number
        const pagesNumber = await getPagesNumber();

        // Reset updatable messages
        dbUpdatable.set('messages', false).write();
        dbUpdatable.set('messages', {}).write();

        // Loop in all pages
        for(let page = 1;page<=pagesNumber;page++) {

            // Get page messages
            const pageMessages = await getMessagesFromPage(page);

            // Manage messages
            await manageMessagesFromPage(page, pageMessages);

            // Save all message in updatable message db
            dbUpdatable.get('messages').assign(pageMessages).write();
        }

        // Check if a message is removed ( And get list )
        const removedMessages = await checkIfMessageRemoved();

        // Set Bitcointalk full message
        let bitcointalkFullMessage = '';

        // Set Email full message
        let emailFullMessage = '';

        // Loop in all removed messages
        for(const message of removedMessages) {

            // Add alert in bitcointalk message
            bitcointalkFullMessage =
                bitcointalkFullMessage+
                ((bitcointalkFullMessage == '') ? '' : '\n\n[hr]\n\n')+
                'This message is a alert sent by : [url=https://bitcointalk.org/index.php?topic=5194216.msg52808085#msg52808085]Bitcointalk : Auto Verify Signatures - Archive and alert ![/url]\n\n'+
                '[url='+message.link+']This message[/url] from '+message.user.name+' has been [b][color=red]removed[/color][/b].\n\n'+
                '[b]Full message :[/b]\n'+
                stripHtmlFromMessage(message.fullText);

            // Add alert in email message
            emailFullMessage =
                emailFullMessage+
                ((emailFullMessage == '') ? '' : '<br /><br />---------------------------------------------------------------<br /><br />')+
                'This email is a alert sent by : Bitcointalk : Auto Verify Signatures - Archive and alert !<br /><br />'+
                '<a href="'+message.link+'">This message from '+message.user.name+' has been <b style="color:red;">removed</b>.</a><br /><br />'+
                '<b>Full message :</b><br />'+
                stripHtmlFromMessage(message.fullText);
        }

        // Send Bitcointalk alert
        await sendBitcointalkAlert('Bitcointalk - Alerts : Message(s) removed !', bitcointalkFullMessage);

        // If email is enable
        if(config.email.enable) {

            // Send alert email
            mailTransporter.sendMail({
                from: '"Bitcointalk - Alerts" <'+config.email.sender+'>',
                to: config.email.receivers,
                subject: 'Bitcointalk - Alerts : Message(s) removed !',
                html: emailFullMessage
            });
        }

        // Set can check last messages status
        db.set('canCheckLast', true).write();

        // Log
        console.log('End of checking DB messages ...');

        // Resolve
        resolve();
    });
}

// Function for manage messages from page
const manageMessagesFromPage = function (pageNumber, messages) {

    // Return promise
    return new Promise(async function (resolve) {

        // Get DB messages
        const dbMessages = db.get('messages');

        // Set messages list for save in DB
        const messagesForSave = {};

        // Loop in all messages
        for(const messageId in messages) {

            // Manange message
            const response = await manageMessageFromPage(dbMessages, messages[messageId]);

            // If need to save
            if(response.needToSave) {

                // Add in list
                messagesForSave[messageId] = messages[messageId];
            }
        }

        // If have message for save
        if(Object.keys(messagesForSave).length > 0) {

            // Log
            console.log('Save '+Object.keys(messagesForSave).length+' message(s) from page number : '+pageNumber);

            // Save new messages
            db.get('messages').assign(messagesForSave).write();
        }

        // Resolve
        resolve();
    });
}

// Function for manage message from page
const manageMessageFromPage = function (dbMessages, message) {

    // Return promise
    return new Promise(function (resolve) {

        // Set need to save status
        let needToSave = true;

        // If message is saved
        if(dbMessages.has(message.messageId).value()) {

            // Update need to save status
            needToSave = false;

            // Set db message
            const dbMessage = dbMessages.get(message.messageId);

            // If message has been updated
            if(message.fullText !== dbMessage.get('fullText').value() && !dbMessage.has('updatedAlertSent').value() && (message.dates.message + config.timeInMinutesBeforeDetectMessageUpdate * 60 * 1000) <= message.dates.edit && (message.dates.edit + (config.maxEditedTimeInDaysToDetectUpdate * 24 * 60 * 60 * 1000)) >= new Date().getTime()) {

                // Log
                console.log('Alert | A message from '+message.user.name+' has been updated : '+message.link);

                // Update DB message
                dbMessage.set('updatedAlertSent', true).write();

                // Send Bitcointalk alert
                sendBitcointalkAlert(
                    'Bitcointalk - Alerts : A message has been updated !',
                    'This message is a alert sent by : [url=https://bitcointalk.org/index.php?topic=5194216.msg52808085#msg52808085]Bitcointalk : Auto Verify Signatures - Archive and alert ![/url]\n\n'+
                    '[url='+message.link+']This message from '+message.user.name+' has been updated.[/url]\n\n'+
                    '[b]Old message : [/b]\n'+
                    stripHtmlFromMessage(dbMessage.get('fullText').value())+'\n\n'+
                    '[b]New message :[/b]\n'+
                    stripHtmlFromMessage(message.fullText)
                );

                // If mail is enable
                if(config.email.enable) {

                    // Send alert email
                    mailTransporter.sendMail({
                        from: '"Bitcointalk - Alerts" <'+config.email.sender+'>',
                        to: config.email.receivers,
                        subject: 'Bitcointalk - Alerts : A message has been updated !',
                        html:
                            'This email is a alert sent by : Bitcointalk : Auto Verify Signatures - Archive and alert !<br /><br />'+
                            '<a href="'+message.link+'">This message from '+message.user.name+' has been updated.</a><br /><br />'+
                            '<b>Old message : </b><br />'+
                            stripHtmlFromMessage(dbMessage.get('fullText').value())+'<br /><br />'+
                            '<b>New message :</b><br />'+
                            stripHtmlFromMessage(message.fullText)
                    });
                }
            }
        }

        // Resolve
        resolve({
            needToSave: needToSave
        });
    });
}

// Function for manage last messages
const checkingLastMessages = function () {

    // Return promise
    return new Promise(async function (resolve) {

        // Get last page messages
        const pageMessages = await getMessagesFromPage();

        // Manage messages
        await manageMessagesFromPage('last', pageMessages);

        // Resolve
        resolve();
    });
}

// Function for start web server
const startWebserver = function () {

    // Listen get data link
    webApp.get('/get-messages/:page?', function (req, res) {

        // Set current page number
        const pageNumber = (req.params.page && !isNaN(req.params.page)) ? req.params.page : 1;

        // Send response
        res.json(Object.entries(db.get('messages').value()).slice(((pageNumber - 1) * config.webServer.messagesPerPage), (pageNumber * config.webServer.messagesPerPage)).map(entry => entry[1]));
    });

    // Listen root link
    webApp.get('/', function (req, res) {

        // Send response
        res.sendFile(__dirname+'/views/index.html');
    });

    // Listen web server port
    webApp.listen(config.webServer.port, function () {

        // Log
        console.log('Web server is ready on port : '+config.webServer.port);
    });
}

// Function for start bot
const start = async function () {

    // If Bitcointalk alerts enable
    if(config.bitcointalk.enable) {

        // Connect user to Bitcointalk
        await executeBttRequest(config.links.bitcointalk.login+';ccode='+config.bitcointalk.captchaCode, {
            user: config.bitcointalk.username,
            passwrd: config.bitcointalk.password,
            cookieneverexp: 'on'
        }, bitcointalkCookies);
    }

    // Start loop for checking all messages
    setLoop(async function (next) {

        // Checking all messages
        await checkingAllMessages();

        // Call next
        next();
    }, config.timeInHoursBetweenCheckAllMessages * 60 * 60 * 1000);

    // Start loop for checking last messages
    setLoop(async function (next) {

        // Check if can check
        if(db.has('canCheckLast').value() && db.get('canCheckLast').value()) {

            // Checking last messages
            await checkingLastMessages();
        }

        // Call next
        next();
    }, config.timeInSecondsBetweenCheckLastMessages * 1000);

    // If webserver is enable
    if(config.webServer.enable) {

        // Start web server
        startWebserver();
    }
}

// Start bot
start();
