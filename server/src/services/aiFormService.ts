import OpenAI from 'openai';

const MODEL = 'gpt-4o';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiFormResult {
  done: boolean;
  message: string;
  template?: unknown;
}

const SYSTEM_PROMPT = `You help a user design a PDF form by chatting with them.

You can only use these field types: text, date, select, checkbox.

Ask short clarifying questions one or two at a time until you know:
- the form's purpose/title
- every field needed, its label, and its type
- for "select" fields, the list of options

Once you have enough information, stop asking questions and output the final form by calling the "submit_template" tool. Do not call the tool until you are confident the field list is complete.

When calling submit_template, produce a pdfme Template object:
{
  "basePdf": { "width": 210, "height": 297, "padding": [10, 10, 10, 10] },
  "schemas": [[ ...elements... ]]
}

IMPORTANT: For every input field, you MUST also include a label element immediately before it in the schemas array. Labels are read-only text that tell the user what to fill in.

Layout rules (all measurements in millimeters, A4 page = 210 x 297):
- "schemas" is an array of pages. Each page is an array of elements: [ [page1elements...], [page2elements...], ... ]
- Include as many fields as the user needs — use multiple pages if required.
- On the FIRST page, start at y:22 (after the title). On subsequent pages, start at y:15.
- Each row = a label + an input field:
  - Label:      y = rowY,     height = 5,  fontSize = 8,  readOnly = true
  - Input:      y = rowY + 6, height = 9,  fontSize = 11
  - Next rowY = rowY + 18
- When rowY + 18 would exceed 270, start a new page and reset rowY to 15.
- Every element must have x=20, width=160.
- EVERY element must have all required fields: name, type, position ({x, y}), width, height, fontSize.
- Label elements must also have: readOnly=true, content="Human Readable Label".
- Input elements of type "select" must also have: options: string[].
- Do NOT leave any element with undefined or missing fields.

Add a title only on page 1:
{ "name": "form_title", "type": "text", "position": {"x":20,"y":8}, "width":170, "height":10, "fontSize":16, "readOnly":true, "content":"<Form Title Here>" }

Label element shape:
{
  "name": "label_<field_name>",
  "type": "text",
  "position": { "x": 20, "y": <rowY> },
  "width": 160, "height": 5, "fontSize": 8,
  "readOnly": true,
  "content": "Human Readable Label"
}

Input element shape:
{
  "name": "unique_snake_case_key",
  "type": "text" | "date" | "select" | "checkbox",
  "position": { "x": 20, "y": <rowY + 6> },
  "width": 160, "height": 9, "fontSize": 11
}

Work through every field one by one, computing rowY carefully before writing each element. Double-check that no element is missing any required property before calling submit_template.`;

const SUBMIT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_template',
    description: 'Submit the final pdfme template once the form design is fully known.',
    parameters: {
      type: 'object',
      required: ['template'],
      properties: {
        template: {
          type: 'object',
          description: 'A pdfme Template object with basePdf and schemas.',
        },
      },
    },
  },
};

export async function runAiFormChat(messages: ChatMessage[]): Promise<AiFormResult> {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ],
    tools: [SUBMIT_TOOL],
  });

  const choice = completion.choices[0];
  const toolCall = choice.message.tool_calls?.find(
    (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      tc.type === 'function' && tc.function.name === 'submit_template'
  );

  if (toolCall) {
    const args = JSON.parse(toolCall.function.arguments) as { template: unknown };
    return {
      done: true,
      message: choice.message.content ?? 'Your form is ready.',
      template: args.template,
    };
  }

  return {
    done: false,
    message: choice.message.content ?? '',
  };
}
