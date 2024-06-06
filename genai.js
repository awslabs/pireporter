const fs = require('fs');
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime"); // CommonJS import

if (fs.existsSync('./conf.json')) {
    var conf = JSON.parse(fs.readFileSync('./conf.json', 'utf8'))
} else {
    console.error('Cant load ./conf.json. Chec kif file exists in the current directory.')
}

const client = new BedrockRuntimeClient({region: conf.bedrockRegion.value});

const inferenceParallelDegree = conf.inferenceParallelDegree.value || 8;

function getBedrockCommand (system_prompt, prompt, messages, model = conf.claudeMode.value || "anthropic.claude-3-sonnet-20240229-v1:0") {

  const input = {
  "modelId": model,
  "contentType": "application/json",
  "accept": "application/json",
  "body": JSON.stringify({
    "anthropic_version": conf.anthropicVersion.value || "bedrock-2023-05-31",
    "max_tokens": 4096,
    "temperature": 0,
    "top_p": 0,
    "system": system_prompt,
    "messages": messages || [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": prompt
          }
        ]
      }
    ]
  })
}


  return new InvokeModelCommand(input);
}



class LLMGenerator {
  
  #engines = {"aurora-postgresql": "Amazon Aurora PostgreSQL compatible (AWS cloud)"}

  #sectionsBuffer = {};
  #usage = {input_tokens: 0, output_tokens: 0};

  constructor(type, snap1, snap2 = null) {
    this.type = type;
    this.snap1 = snap1;
    this.snap2 = snap2;
    this.snap1_comment = snap1.comment || 'No comment';
    this.snap2_comment = snap2?.comment || 'No comment';
    
    if (this.snap1.engine === 'aurora-postgresql') {
       if (fs.existsSync('./genai/knowledge_base/events_primary.json')) {
          this.EventsPrimary = JSON.parse(fs.readFileSync('./genai/knowledge_base/events_primary.json', 'utf8'))
       } else {
          this.EventsPrimary = [] 
       }
      
       if (fs.existsSync('./genai/knowledge_base/events.json')) {
          this.Events = JSON.parse(fs.readFileSync('./genai/knowledge_base/events.json', 'utf8'))
       } else {
          this.Events = {}
       }
    }
 
  }
  

  getSections() {
    return this.#sectionsBuffer;
  }
  
  getSection(section) {
    return this.#sectionsBuffer[section];
  }
  
  getUsage() {
    return this.#usage;
  }
  
  #eventDescriptions(events) {
     var result = "";
     
     events.forEach(event => {
       let eventObj = this.EventsPrimary.find(obj => obj.events.includes(event.toLowerCase()));
       
       if (eventObj) {
         result = result + "\nEvent: " + event + "\nDescription: " + eventObj.value + "\n"
       } else if (this.Events[event.toLowerCase()]) {
         result = result + "\nEvent: " + event + "\nDescription: " + this.Events[event.toLowerCase()] + "\n"
       }
     });
     
     return result
  }
  
  #prepareComparePrompt(prompt) {
     var p = prompt.replace('{{ snap1_engine }}', this.#engines[this.snap1.engine]);
     p = p.replace('{{ snap2_engine }}', this.#engines[this.snap2.engine]);
     p = p.replace('{{ snap1_region }}', this.snap1.region);
     p = p.replace('{{ snap2_region }}', this.snap2.region);
     p = p.replace('{{ snap1_start }}', this.snap1.startTime);
     p = p.replace('{{ snap1_end }}', this.snap1.endTime);
     p = p.replace('{{ snap2_start }}', this.snap2.startTime);
     p = p.replace('{{ snap2_end }}', this.snap2.endTime);
     p = p.replace('{{ snap1_m }}', this.snap1_comment);
     p = p.replace('{{ snap2_m }}', this.snap2_comment);
     return p
  }
  
  #prepareSinglePrompt(prompt) {
     var p = prompt.replace('{{ engine }}', this.#engines[this.snap1.engine]);
     p = p.replace('{{ region }}', this.snap1.region);
     p = p.replace('{{ start }}', this.snap1.startTime);
     p = p.replace('{{ end }}', this.snap1.endTime);
     p = p.replace('{{ m }}', this.snap1_comment);
     return p
  }
  
  #getKnowledge(engine) {
    var knowledge;
    if (this.snap1.engine === "aurora-postgresql") {
      if (fs.existsSync('./genai/knowledge_base/aurora-postgresql.txt')) {
           knowledge = fs.readFileSync('./genai/knowledge_base/aurora-postgresql.txt', 'utf8');
         } else {
           knowledge = "";
         }
    }
    return knowledge
  }



  // Prompt generator begin
   async #generateLLMOutput (payload) {
    
    const processBody = (body) => {
       const respBodyBuf = Buffer.from(body);
       const respBody = JSON.parse(respBodyBuf.toString());
       const text = respBody.content[0].text;
       const usage = respBody.usage;
       const stopReason = respBody.stop_reason;
       this.#usage.input_tokens += usage.input_tokens;
       this.#usage.output_tokens += usage.output_tokens;
       this.#sectionsBuffer[section] = (this.#sectionsBuffer[section] || "") + text;
       return {usage, text, stopReason}
    }
    
    var knowledge;
    if (this.type === 'single_snapshot') {
       knowledge = `Knowledge related to ${this.#engines[this.snap1.engine]}:` + '\n' + this.#getKnowledge(this.snap1.engine);
    
    } else {
       if (this.snap1.engine === this.snap2.engine) {
         knowledge = `Knowledge related to ${this.#engines[this.snap1.engine]}:` + '\n' + this.#getKnowledge(this.snap1.engine);
       } else {
         knowledge = `Knowledge related to ${this.#engines[this.snap1.engine]}:` + '\n' + this.#getKnowledge(this.snap1.engine) + '\n' + `Knowledge related to ${this.#engines[this.snap2.engine]}:` + '\n' + this.#getKnowledge(this.snap2.engine);
       } 
      
    }
     
    var section = payload.section;
    var filePath = `./genai/templates/${section}.txt`;
    
    var templateContent = fs.readFileSync(filePath, 'utf8');
    var lines = templateContent.split('\n');
    // Destructure the first line into system_prompt and the rest into prompt
    var [system_prompt, ...rest] = lines;
    var prompt = rest.join('\n');
    
    if (this.type === 'single_snapshot') {
       prompt = this.#prepareSinglePrompt(prompt);
    } else {
       prompt = this.#prepareComparePrompt(prompt);
    }
    
    
    switch (true) {
      case section.endsWith('_general_info'):
      case section.endsWith('_nondef_params'):
      case section.endsWith('_static_metrics'):
      case section.endsWith('_additional_metrics'):
      case section.endsWith('_instance_recommendations'):
        prompt = prompt.replace('{{ data }}', payload.data || '');
        break;
      case section.endsWith('_os_metrics'):
      case section.endsWith('_db_metrics'):
        prompt = prompt.replace('{{ knowledge }}', knowledge);
        prompt = prompt.replace('{{ data }}', payload.data || '');
        break;
      case section.endsWith('_wait_events'):
        prompt = prompt.replace('{{ knowledge }}', knowledge);
        prompt = prompt.replace('{{ events }}', this.#eventDescriptions(payload.events) || '');
        prompt = prompt.replace('{{ data }}', payload.data || '');
        break;
      case section.endsWith('_summary'):
        let concatenatedSummaries = Object.entries(this.#sectionsBuffer).filter(([key]) => !key.endsWith('_summary')).map(([key, value]) => "\n**"+key+"**\n\n"+value).join('\n');
        prompt = prompt.replace('{{ knowledge }}', knowledge);
        prompt = prompt.replace('{{ summaries }}', concatenatedSummaries);
        prompt = prompt.replace('{{ sqls }}', payload.sqls);
        prompt = prompt.replace('{{ sqltext }}', payload.sqltext || '');
        break;
      default:
        break;
    }
    
    //console.log('PROMPT', prompt)
    
    let command
    if (section.endsWith('_summary')) {
        let prefillFilePath = (this.type === 'single_snapshot') ? `./genai/templates/single_summary_prefilling.txt` : `./genai/templates/compare_summary_prefilling.txt`;
        var prefillFileContent = fs.readFileSync(prefillFilePath, 'utf8');
        command = getBedrockCommand(system_prompt, null, [
            {"role": "user", "content": [{"type": "text", "text": prompt}]},
            {"role": "assistant", "content": [{"type": "text", "text": prefillFileContent}]}
          ])
    } else {
        command = getBedrockCommand(system_prompt, prompt);
    }
    
    try {
      var response = await client.send(command);
    } catch (error) {
      const { requestId, cfId, extendedRequestId } = error.$metadata;
      console.log(error, { requestId, cfId, extendedRequestId });
    }
    var result = processBody(response.body);
    if (section.endsWith('_summary') && result.stopReason === "max_tokens") {
       command = getBedrockCommand(system_prompt, null, [
            {"role": "user", "content": [{"type": "text", "text": prompt}]},
            {"role": "assistant", "content": [{"type": "text", "text": prefillFileContent + '\n' + result.text}]},
            {"role": "user", "content": [{"type": "text", "text": "Continue"}]}
          ])
       try {
         var response2 = await client.send(command);
         result = processBody(response2.body);
         
         /*const respBodyBuf = Buffer.from(response2.body);
         const respBody = JSON.parse(respBodyBuf.toString());
         const text = respBody.content[0].text;
         console.log('RESP2', text) */
       } catch (error) {
         const { requestId, cfId, extendedRequestId } = error.$metadata;
         console.log(error, { requestId, cfId, extendedRequestId });
       }
  
       
    }
    
    return result
    
  } // Prompt generator end
  
  
  async #generateSingle (payload) {
    console.log(payload)
  }
  
  generate (payload) {
    return this.#generateLLMOutput(payload);
  }
  
  async generateParallel (payloadArray) {
    
    for (let i = 0; i < payloadArray.length; i += inferenceParallelDegree) {
       let group = payloadArray.slice(i, i + inferenceParallelDegree);
       let promises = group.map(payload => this.#generateLLMOutput.bind(this, payload))
    
       try {
         var results = await Promise.all(promises.map(func => func()))
       } 
       catch (error) {
         console.log(error)
       }
       
    }
    
  }

}

module.exports = { LLMGenerator };
