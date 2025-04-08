/**
 * @fileoverview This script contains the server-side logic for the survey webpage and the 
 * chatbot interface. 
 * @author Samuel König <koenigsamuel99@gmx.de>
 * @version 1.0.0
 */

/**************************************************************************
 * Initialization of dependencies and environment variables
 **************************************************************************/

/**
 * Definition of variables used in the script.
 * 
 * - randomTreatment @type {boolean}: if true, the treatment group value is assigned randomly.
 * If false, the treatment group value takes the value of treatmentFallback.
 * - treatmentFallback @type {number}: the static treatment group value if randomTreatment
 * is set to false.
 */
const randomTreatment = true;   // To be specified: whether the treatment group is assigned randomly!
const treatmentFallback = 1;     // To be specified: the treatment fallback value!

/**
 * Load the environment variables from the .env file (DATABASE_URL and DIRECT_LINE_SECRET).
 */
require('dotenv').config(); 

/**
 * Load dependencies.
 */
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const crypto = require('crypto');
const axios = require('axios');

/**************************************************************************
 * Setup of webpage, database and chatbot api
 **************************************************************************/

/**
 * Setup of the webpage.
 * 
 * - Initializes the express application.
 * - Initialiazes a middleware for extracting json data. 
 * - Provides the html, css and javascript files from the public directory. 
 */
const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

/**
 * Set up an in-memory storage for processed messages and messages in progress
 * to avoid duplicates.
 * Automatically clear the stored processed message ids after one hour.
 */
const processedMessages = new Map();
const inProgressMessages = new Map(); 
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  for (const [key, value] of processedMessages) {
    if (now - value.timestamp > oneHour) {
      processedMessages.delete(key);
    }
  }
}, 3600000);

/**
 * Setup of the database connection.
 * 
 * - Establishes a connection to the postgreSQL database, using the DATABASE_URL from the 
 *   environment variables. 
 * - Tests the connection to the database. 
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error when connecting with the database:', err.stack);
    }
    console.log('Successfully connected with the database');
    release();
});

/**
 * Setup of the botframework api.
 * 
 * - Loads the DIRECT_LINE_SECRET from the environment variables, acting as key for the api. 
 * - Creates the base url for the botframework direct line api. 
 */
const DIRECT_LINE_SECRET = process.env.DIRECT_LINE_SECRET;
if (!DIRECT_LINE_SECRET) {
    console.error("DIRECT_LINE_SECRET not set in environment variables");
    process.exit(1);
}
const DIRECT_LINE_BASE = "https://europe.directline.botframework.com/v3/directline";

/**************************************************************************
 * Generation of metadata
 **************************************************************************/

/**
 * Generates a unique participant id.
 * 
 * - Generates a participant id using the createParticipantId function and checks whether the
 *   generated id already exists in the database. If this is the case, repeats this procedure
 *   until a unique id is generated. 
 * 
 * @returns {string} A unique participant id. 
 */
async function generateUniqueParticipantId() {
    while (true) {
        const id = createParticipantId();
        const result = await pool.query('SELECT participant_id FROM survey_responses WHERE participant_id = $1', [id]);
        if (result.rows.length === 0) {
            return id;
        }
    }
}

/**
 * Creates a participant id. 
 * 
 * - The participand id starts with "ID-", followed by a fifteen-digit, random character 
 *   string and a timestamp. 
 * 
 * @returns {string} A participant id. 
 */
function createParticipantId() {
    const prefix = 'ID-';
    const randomBytes = crypto.randomBytes(8);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomStr = '';
    for (let i = 0; i < 15; i++) {
        const randomIndex = randomBytes[i % randomBytes.length] % chars.length;
        randomStr += chars.charAt(randomIndex);
    }

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');

    const timestamp = `${month}${day}${hour}${minute}${second}${ms}`;
    return prefix + randomStr + timestamp;
}

/**
 * Assigns a group to the client. 
 * 
 * - Creates the random variable treatment.
 * - If randomTreatment is true, assigns 0 or 1 randomly to this variable.
 * - Otherwise, assigns the treatmentFallback value to this variable. 
 * 
 * @returns {number} A treatment group value. 
 */
function assignGroup() {
  if (randomTreatment) {
    return Math.random() < 0.5 ? 0 : 1;
  } else {
    return treatmentFallback;
  }
}

/**************************************************************************
 * Survey-related endpoints
 **************************************************************************/

/**
 * Provides the client with a participant id and a treatment group value. 
 * 
 * - Provides participant id and treatment group in json format. 
 * 
 * @returns {object} json object with participant id and treatment group. 
 */
app.get('/generateSurveyData', async (req, res) => {
    try {
        const participantId = await generateUniqueParticipantId();
        const treatmentGroup = assignGroup();
        res.json({ 
          participantId: participantId, 
          treatmentGroup: treatmentGroup
         });
    } catch (error) {
        console.error('Error when generating participantId or treatmentGroup:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * Receives the survey data submitted by the client and stores them in the database. 
 * 
 * - Receives the participantId, treatmentGroup, conversationLog by the client in json format. 
 * - Receives the survey question answers by the client and join them in a json object 
 *   responseData. 
 * - Inserts the participantId, treatmentGrou, conversationLog and responseData into the 
 *   database.
 * 
 * @param {object} req - The survey data submitted by the client. 
 */
app.post('/submit', async (req, res) => {
    const { participantId, treatmentGroup, conversationLog, ...responseData } = req.body;
    if (!participantId || !treatmentGroup || !conversationLog) {
      return res.status(400).json({ error: 'All fields are necessary.' });
    }

    try {
      const query = `
      INSERT INTO survey_responses (participant_id, treatment_group, response_data, conversation_log)
      VALUES ($1, $2, $3, $4)
    `;
    const values = [participantId, treatmentGroup, JSON.stringify(responseData), conversationLog];
    await pool.query(query, values);
    res.sendStatus(200);
    } catch (error) {
        console.error('Error with inserting the data:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * Receives the email submitted by the client and stores it in the database. 
 * 
 * - Receives the email by the client. 
 * - Inserts the email in a separate table. 
 * 
 * @param {object} req - The email submitted by the client. 
 */
app.post('/submit-email', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const query = `
      INSERT INTO emails (email_address)
      VALUES ($1)
    `;
    const values = [email];
    await pool.query(query, values);  //TODO: Zum Testen ohne Daten abschicken auskommentieren

    return res.sendStatus(200);
  } catch (error) {
    console.error('Error saving email:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**************************************************************************
 * Chatbot-related endpoints
 **************************************************************************/

/**
 * Endpoint to start a new conversation with the chatbot via the botframework direct line api. 
 * 
 * - Starts a new conversation with the chatbot.
 * - Sends a conversationUpdate to the chatbot to inform the chatbot that the user has joined 
 *   the conversation and to inform the chatbot about the user's treatment group value. 
 * 
 * @param {object} req - An object with the client's treatment group value.
 * @returns {object} json object with the conversation id. 
 */
app.post('/startconversation', async (req, res) => {
  const { treatmentGroup } = req.body; 
  try {
    const response = await axios.post(`${DIRECT_LINE_BASE}/conversations`, {}, {
      headers: {
        'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
        'Content-Type': 'application/json'
      }
    });
    const data = response.data;
    const activity = {
      type: "conversationUpdate",
      membersAdded: [{ id: "user1" }],
      from: { id: "Test_Chatbot_1" },
      channelData: { treatmentGroup: treatmentGroup }
    };
    await axios.post(`${DIRECT_LINE_BASE}/conversations/${data.conversationId}/activities`, activity, {
      headers: {
        'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(data);
  } catch (err) {
    console.error("Error when starting the conversation:", err);
    res.status(500).json({ error: "Error when starting the conversation", details: err.toString() });
  }
});

/**
 * Endpoint to retrieve new activities from the chatbot. 
 * 
 * - Receives the conversationId, watermark and treatmentGroup values from the client. 
 * - Retrieves new activities in the conversation. The watermark value is added to the 
 *   retrieval url to only receive new activities since the last retrieval. 
 * - Provides the client with the new activities. 
 * 
 * @param {object} req - An object with the conversationId, watermark and treatment group 
 * values. 
 * @returns {object} json object with the new activities since the last activity retrieval. 
 */
app.post('/getactivities', async (req, res) => {
  const { conversationId, watermark, treatmentGroup } = req.body;
  let url = `${DIRECT_LINE_BASE}/conversations/${conversationId}/activities`;
  if (watermark) {
    url += `?watermark=${watermark}`;
  }
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${DIRECT_LINE_SECRET}`
      }
    });
    const data = response.data;
    data.treatmentGroup = treatmentGroup;
    res.json(data);
  } catch (err) {
    console.error("Error when retrieving the activities:", err);
    res.status(500).json({ error: "Error when retrieving the activities", details: err.toString() });
  }
});

/**
 * Endpoint to send a user message to the chatbot. 
 * 
 * - Receives the conversationId, the user message and the treatmentGroup value from
 *   the client. 
 * - Adds the new user message to the conversation via the direct line api. 
 * - Generates a messageKey and saves it in the in-memory storage. Before adding a 
 * new message to the conversation, checks whether this message is not already 
 * existing in the in-memory storage (if this is the case, returns an empty json).
 * 
 * @param {object} req - An object with the conversationId, the user message and the 
 * treatment group value. 
 * @returns {object} json object with the conversation id.
 */
app.post('/sendmessage', async (req, res) => {
  const { conversationId, text, treatmentGroup, clientSideMsgId } = req.body;
  const messageKey = `${conversationId}::${clientSideMsgId}`;

  if (processedMessages.has(messageKey)) {
    const storedEntry = processedMessages.get(messageKey);
    return res.json({ status: "duplicate", id: storedEntry.id });
  }

  if (inProgressMessages.has(messageKey)) {
    return res.json({ status: "in_progress" });
  }

  inProgressMessages.set(messageKey, true);

  const activity = {
    type: "message",
    from: { id: "user1" },
    text,
    channelData: { treatmentGroup: treatmentGroup }
  };

  try {
    const response = await axios.post(`${DIRECT_LINE_BASE}/conversations/${conversationId}/activities`, activity, {
      headers: {
        'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
        'Content-Type': 'application/json'
      }
    });

    processedMessages.set(messageKey, { timestamp: Date.now(), id: response.data.id });
    inProgressMessages.delete(messageKey);
    res.json(response.data);

  } catch (err) {
    console.error("Error when sending the message:", err);
    inProgressMessages.delete(messageKey);
    res.status(500).json({ error: "Error when sending the message", details: err.toString() });
  }
});

/**************************************************************************
 * Start the server
 **************************************************************************/

/**
 * Determines the port on which the server is running and starts the server. 
 * 
 * - When the server is running locally, the default port is 3000. Otherwise, the 
 *   port is automatically assigned based on the environment variables. 
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
