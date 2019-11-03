
/*************************************************************************************************************************/
/*************************************************************************************************************************/
/*    This script allows all those who wish to archive the messages of the subject "Stake your Bitcoin address here".    */
/*         In addition to that, in case of modifications or deletion of a message, you can choose to be alerted.         */
/*                The code is voluntarily well commented in order to make easier the understanding of it.                */
/*************************************************************************************************************************/
/*************************************************************************************************************************/

// Load modules
const Jquery = require('jquery');
const Jsdom = require('jsdom');
const Request = require('request');
const Lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync')

// App config
const config = {
    links: {
        bitcointalk: {
            stakeAddress: 'https://bitcointalk.org/index.php?topic=996318'
        }
    },
    timeInSecondsBetweenBttRequest: 1
};

// App variables
const originalConsolLog = console.log;
let lastBttRequest = 0;

// Init low database
const adapter = new FileSync('db.json')
const db = Lowdb(adapter)
db.defaults({
    messages: {}
}).write();

// Function for get time
const getTime = function () {

    // Return date
    return (new Date()).getTime();
}

// Function for log messages
console.log = function (log) {

    const today = new Date();

    if(typeof log === 'string') {

        originalConsolLog(today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate()+' '+today.getHours()+':'+today.getMinutes()+':'+today.getSeconds()+' > '+log);
    } else {

        originalConsolLog(log);
    }
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
const executeBttRequest = function (link) {

    // Return promise
    return new Promise(async function (resolve) {

        // Function for execute request
        const executeRequest = function () {

            // Log
            console.log('Execute BTT request : '+link);

            // Save last btt request time
            lastBttRequest = getTime();

            // Execute request
            Request.get(link, function (error, header, response) {

                // Return page response
                resolve(response);
            });
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

// Function for get pages number
const getPagesNumber = function () {

    // Return promise
    return new Promise(async function (resolve) {

        // Get page content
        const pageContent = await executeBttRequest(config.links.bitcointalk.stakeAddress);

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
        const pageContent = await executeBttRequest(config.links.bitcointalk.stakeAddress+((page == 'last') ? '.new;topicseen#new' : '.'+((page - 1)*20)));

        // Init dom
        const dom = getDom(pageContent);
        const document = dom.document;
        const $ = dom.jquery;

        // Get dom messages
        const domMessages = $(document).find('.windowbg .message_number, .windowbg2 .message_number').closest('.windowbg, .windowbg2');
        const messages = {};

        // Loop in all dom messages
        domMessages.each(function () {

            // Get message infos
            const domMessage = $(this).find('.post').html();
            const username = $(this).find('.poster_info > b > a').first().text().trim();
            const messageId = $(this).find('.message_number').attr('href').match(/#[a-z0-9_]+/gi)[0].replace('#', '');

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
                    }
                };
            }
        });

        // Return all messages
        resolve(messages);
    });
}

// Function for manage messages in db
const manageDbMessages = function () {

    // Return promise
    return new Promise(async function (resolve) {

        // Get page number
        const pagesNumber = await getPagesNumber();

        // Loop in all pages
        for(let page = ((db.has('lastPageChecked').value()) ? db.get('lastPageChecked').value() : 1);page<=pagesNumber;page++) {

            // Save last page checked
            db.set('lastPageChecked', page).write();

            // Get page messages
            const pageMessages = await getMessagesFromPage(page);

            // Manage messages
            await manageMessagesFromPage(pageMessages);
        }

        // Reset last page checked
        db.set('lastPageChecked', 1).write();

        // Resolve
        resolve();
    });
}

// Function for manage messages from page
const manageMessagesFromPage = function (messages) {

    // Return promise
    return new Promise(async function (resolve) {

        // Loop in all messages
        for(const messageId in messages) {

            // Manange message
            await manageMessageFromPage(messages[messageId]);
        }

        // Resolve
        resolve();
    });
}

// Function for manage message from page
const manageMessageFromPage = function (message) {

    // Return promise
    return new Promise(function (resolve) {

        // Set DB messages
        const dbMessages = db.get('messages');

        // If message is not saved
        if(!dbMessages.has(message.messageId).value()) {

            // Log
            console.log('New message saved : '+message.link);

            // Save message
            dbMessages.set(message.messageId, message).write();
        } else {

            // Set db message
            const dbMessage = dbMessages.get(message.messageId);

            // If message have been updated
            if(message.fullText !== dbMessage.get('fullText').value() && !dbMessage.has('alertSent').value()) {

                // Log
                console.log('Alert | A message have been updated : '+message.link);

                // Update DB message
                dbMessage.set('alertSent', true).write();

                // TODO: Send email alert
            }
        }

        // Resolve
        resolve();
    });
}

// Function for start bot
const start = async function () {

    // Start loop for manage db messages
    setLoop(async function (next) {

        // Start managing of db messages
        await manageDbMessages();

        // Call next
        next();
    }, 12 * 60 * 60 * 1000);
}

// Start bot
start();
