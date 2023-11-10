// IMPORTS //

const express = require('express');
const ws = require('ws');
const uuid = require('uuid');
const cors = require('cors');

// ENVIRONMENT VARIABLES //

require('dotenv').config();

const HF_AUTH = process.env['HF_AUTH']

// CONFIGURATIONS //

const app = express();

const gradio_version = "0.2.7";
const headers = { "user-agent": `gradio_client/${gradio_version}`, "Authorization": `Bearer ${HF_AUTH}` };

// FUNCTIONS //

async function generate(data, fn_index, model_url) {
  let session_hash = uuid.v4();
  let json_data = JSON.stringify({ "data": data, "fn_index": fn_index, "session_hash": session_hash });
  let json_hash_data = JSON.stringify({ "fn_index": fn_index, "session_hash": session_hash });
  return new Promise((mainResolve, mainReject) => {
      const websocket = new ws(`wss://${model_url}queue/join`, {headers: headers, maxPayload: 1024 * 1024 * 1024});
      websocket.on('open', () => {
          websocket.on('message', (event) => {
              let resp = JSON.parse(event);
              if (resp.msg === "queue_full") { mainReject("[WEBSOCKET] Queue is full, please try again!"); }
              else if (resp.msg === "send_hash") { websocket.send(json_hash_data); }
              else if (resp.msg === "send_data") { websocket.send(json_data); }
              else if (resp.msg === "process_completed") { mainResolve(resp.output); }
          });
      });
      websocket.on('error', (error) => { mainReject(error); });
  });
}

// SERVER //

app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));
app.listen(3000, () => {console.log('[API] API server is running on http://localhost:3000')});

// ENDPOINTS //

app.post('/falcon-40b-api', async (req, res) => {
  try {
    const data = req.body
    const purpose = data["purpose"]

    let instruction = data["instruction"]
    let input = data["input"]
    let history = data["history"]
    let temperature = data["temperature"] || 0.75
    let top_p = data["top_p"] || 0.9

    console.log(`[API] API called: [${purpose} : ${input}]`)

    const build_data = [input, history, instruction, temperature, top_p]
    generate(build_data, 1, "huggingfaceh4-falcon-chat.hf.space/").then((result) => {
      let result_history = result["data"][0];
      let get_result = result_history[result_history.length - 1][1];
      console.log(`[API] API result: [${get_result}]`)
      const response = {'status': 'success', 'content': get_result}
      res.json(response);
    })
  }
  catch (result) {
    console.log(`[API] API error: [${result}]`)
    const response = {'status': 'error', 'content': result}
    res.json(response);
  }
});

app.post('/mosaic-30b-api', async (req, res) => {
  try {
    const data = req.body
    const purpose = data["purpose"]

    let instruction = data["instruction"]
    let input = data["input"]
    let history = data["history"]

    history.push([input, "..."])

    console.log(`[API] API called: [${purpose} : ${instruction} : ${input}]`)

    const build_data = [instruction, history]
    generate(build_data, 1, "mosaicml-mpt-30b-chat.hf.space/").then((result) => {
      let result_history = result["data"][1];
      let get_result = result_history[result_history.length - 1][1];
      console.log(`[API] API result: [${get_result}]`)
      const response = {'status': 'success', 'content': get_result}
      res.json(response);
    })
  }
  catch (result) {
    console.log(`[API] API error: [${result}]`)
    const response = {'status': 'error', 'content': result}
    res.json(response);
  }
});
