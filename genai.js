const fs = require('fs');
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime"); // CommonJS import

if (fs.existsSync('./conf.json')) {
    var conf = JSON.parse(fs.readFileSync('./conf.json', 'utf8'))
} else {
    console.error('Cant load ./conf.json. Chec kif file exists in the current directory.')
}

const client = new BedrockRuntimeClient({region: conf.bedrockRegion.value});

const inferenceParallelDegree = conf.inferenceParallelDegree.value || 8;

function getBedrockCommand (system_prompt, prompt, messages, model = conf.bedrockModel.value) {
  const isClaudeModel = model.toLowerCase().includes('claude');
  
  // Transform existing messages to include type:text for Claude
  const transformedMessages = messages ? messages.map(msg => ({
    ...msg,
    content: msg.content.map(c => ({
      type: "text",
      text: c.text
    }))
  })) : undefined

  let bodyContent;
  
  if (isClaudeModel) {
    bodyContent = {
      "max_tokens": 4096,
      "temperature": 0,
      "top_p": 0,
      "messages": transformedMessages || [
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": system_prompt ? system_prompt + "\n\n" + prompt : prompt
            }
          ]
        }
      ]
    };
    
    bodyContent.anthropic_version = conf.anthropicVersion.value;
  } else {
    // For non-Claude models (like Amazon's models)
    bodyContent = {
      "inferenceConfig": {
        "max_new_tokens": 4096,
        "temperature": 0,
        "top_p": 0
      },
      "messages": messages || [
        {
          "role": "user",
          "content": [
            {
              "text": system_prompt ? system_prompt + "\n\n" + prompt : prompt
            }
          ]
        }
      ]
    };
  }

  const input = {
    "modelId": model,
    "contentType": "application/json",
    "accept": "application/json",
    "body": JSON.stringify(bodyContent)
  };

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
    
    if (this.snap1.generalInformation.Engine === 'aurora-postgresql') {
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
     var p = prompt.replace('{{ snap1_engine }}', this.#engines[this.snap1.generalInformation.Engine] + ' ' + ((this.snap1.generalInformation.DBInstanceClass === 'db.serverless') ? 'serverless deployment' : 'provisioned instance'));
     p = p.replace('{{ snap2_engine }}', this.#engines[this.snap2.generalInformation.Engine] + ' ' + ((this.snap2.generalInformation.DBInstanceClass === 'db.serverless') ? 'serverless deployment' : 'provisioned instance'));
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
     var p = prompt.replace('{{ engine }}', this.#engines[this.snap1.generalInformation.Engine] + ' ' + ((this.snap1.generalInformation.DBInstanceClass === 'db.serverless') ? 'serverless deployment' : 'provisioned instance'));
     p = p.replace('{{ region }}', this.snap1.region);
     p = p.replace('{{ start }}', this.snap1.startTime);
     p = p.replace('{{ end }}', this.snap1.endTime);
     p = p.replace('{{ m }}', this.snap1_comment);
     return p
  }
  
  #getKnowledge(engine) {
    var knowledge;
    if (this.snap1.generalInformation.Engine === "aurora-postgresql") {
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
       let text, usage, stopReason;
       
       //console.log('DEBUG', JSON.stringify(respBody, null, 2))

    if (respBody.content && Array.isArray(respBody.content)) {
        text = respBody.content[0].text;
        usage = respBody.usage;
        stopReason = respBody.stop_reason;
    } else if (respBody.results && respBody.results.length > 0) {
        text = respBody.results[0].outputText;
        usage = {
            input_tokens: respBody.inputTokenCount || 0,
            output_tokens: respBody.outputTokenCount || 0
        };
        stopReason = respBody.results[0].completionReason;
    } else if (respBody.generated_text) {
        text = respBody.generated_text;
        usage = respBody.usage || { input_tokens: 0, output_tokens: 0 };
        stopReason = respBody.stop_reason || "unknown";
    } else if (respBody.output?.message?.content?.[0]?.text) {
        // Handle Nova Pro format
        text = respBody.output.message.content[0].text;
        usage = respBody.usage || {
            input_tokens: respBody.usage?.inputTokens || 0,
            output_tokens: respBody.usage?.outputTokens || 0
        };
        stopReason = respBody.stopReason || "unknown";
    } else {
        throw new Error("Unsupported model response format");
    }
      this.#usage.input_tokens += usage.input_tokens;
      this.#usage.output_tokens += usage.output_tokens;
      this.#sectionsBuffer[section] = (this.#sectionsBuffer[section] || "") + text;
      return {usage, text, stopReason}
    }
    
    var knowledge;
    if (this.type === 'single_snapshot') {
       knowledge = `Knowledge related to ${this.#engines[this.snap1.generalInformation.Engine]}:` + '\n' + this.#getKnowledge(this.snap1.generalInformation.Engine);
    
    } else {
       if (this.snap1.generalInformation.Engine === this.snap2.generalInformation.Engine) {
         knowledge = `Knowledge related to ${this.#engines[this.snap1.generalInformation.Engine]}:` + '\n' + this.#getKnowledge(this.snap1.generalInformation.Engine);
       } else {
         knowledge = `Knowledge related to ${this.#engines[this.snap1.generalInformation.Engine]}:` + '\n' + this.#getKnowledge(this.snap1.generalInformation.Engine) + '\n' + `Knowledge related to ${this.#engines[this.snap2.generalInformation.Engine]}:` + '\n' + this.#getKnowledge(this.snap2.generalInformation.Engine);
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
       var templateGrandSummary = fs.readFileSync(`./genai/templates/single_grand_summary.txt`, 'utf8');
       var promptGrandSummary = this.#prepareSinglePrompt(templateGrandSummary);
    } else {
       prompt = this.#prepareComparePrompt(prompt);
       var templateGrandSummary = fs.readFileSync(`./genai/templates/compare_grand_summary.txt`, 'utf8');
       var promptGrandSummary = this.#prepareComparePrompt(templateGrandSummary);
    }
    
    
    switch (true) {
      case section.endsWith('_general_info'):
        prompt = prompt.replace('{{ knowledge }}', knowledge);
      case section.endsWith('_nondef_params'):
        prompt = prompt.replace('{{ knowledge }}', knowledge);
      case section.endsWith('_static_metrics'):
      case section.endsWith('_additional_metrics'):
        prompt = prompt.replace('{{ knowledge }}', knowledge);
      case section.endsWith('_instance_recommendations'):
        prompt = prompt.replace('{{ data }}', payload.data || '');
        break;
      case section.endsWith('_os_metrics'):
        prompt = prompt.replace('{{ knowledge }}', knowledge);
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
            {"role": "user", "content": [{"text": prompt}]},
            {"role": "assistant", "content": [{"text": prefillFileContent}]}
          ])
    } else {
        command = getBedrockCommand(system_prompt, prompt);
    }
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    try {
      let success = false;
      while (!success) {
        try {
          var response = await client.send(command);
          success = true;
        } catch (error) {
          if (error.name === 'ThrottlingException') {
            //console.log('Throttling detected, waiting 3 seconds before retry...');
            await delay(5000); // Wait for 5 seconds
            continue;
          }
          // If it's not a throttling error, throw it
          const { requestId, cfId, extendedRequestId } = error.$metadata;
          console.log(error, { requestId, cfId, extendedRequestId });
          throw error;
        }
      }
    } catch (error) {
      const { requestId, cfId, extendedRequestId } = error.$metadata;
      console.log(error, { requestId, cfId, extendedRequestId });
    }
    
    process.stdout.write('.');
    var result = processBody(response.body);
    
    if (section.endsWith('_summary') && result.stopReason === "max_tokens") {
       command = getBedrockCommand(system_prompt, null, [
            {"role": "user", "content": [{ "text": prompt}]},
            {"role": "assistant", "content": [{ "text": prefillFileContent + '\n' + result.text}]},
            {"role": "user", "content": [{ "text": "Continue"}]}
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
    
      
    //#ag
    if (section.endsWith('_summary')) {
      
         var sectionSummaries = "<h2>General information:</h2>" + this.#sectionsBuffer[section]
      
         promptGrandSummary = promptGrandSummary.replace('{{ knowledge }}', knowledge);
         promptGrandSummary = promptGrandSummary.replace('{{ data }}', sectionSummaries);
         
         //console.log('PROMP GRAND SUMMARY:', promptGrandSummary)
         
         command = getBedrockCommand(system_prompt, null, [
            {"role": "user", "content": [{ "text": promptGrandSummary}]},
            {"role": "assistant", "content": [{ "text": "<h2>Summary:</h2>"}]}
            ]
          )
         
         const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
         try {
           let success = false;
           let retryCount = 0;
           
           while (!success) {
             try {
               var response3 = await client.send(command);
               var result3 = processBody(response3.body);
               
               var grandResult = result3.text + sectionSummaries;
               this.#sectionsBuffer[section] = grandResult;
               success = true;
               process.stdout.write('.');
               
             } catch (error) {
               if (error.name === 'ThrottlingException') {
                 await delay(5000);
                 continue;
               }
               // If it's not a throttling error, log it and throw
               const { requestId, cfId, extendedRequestId } = error.$metadata;
               console.log(error, { requestId, cfId, extendedRequestId });
               throw error;
             }
           }
         } catch (error) {
           const { requestId, cfId, extendedRequestId } = error.$metadata;
           console.log(error, { requestId, cfId, extendedRequestId });
         }
         
         
         return {...result3, text: grandResult}
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
    process.stdout.write('Bedrock analysis running ');
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
