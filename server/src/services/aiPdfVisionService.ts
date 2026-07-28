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

export interface AiPdfVisionResult {
  template: unknown;
}

const SYSTEM_PROMPT = `You are looking at one or more images of pages from a real-world document (such as an invoice, receipt, application form, or letter). Identify every distinct piece of information a person would need to fill in or reference on a NEW, similar document — e.g. "Invoice Number", "Date", "Bill To", "Total Amount", "Item Description". Do not try to reproduce the exact text/values visible in the image; instead, generate the FIELD (its label and appropriate input type) that would capture that kind of information on a blank version of this document.

You can only use these field types: text, date, select, checkbox.

Work out the complete field list from the image(s) alone — do not ask questions. If multiple images are provided, they are consecutive pages of the same document; combine fields found across all of them into one template.

Once you have identified the fields, call the "submit_template" tool. Do not call the tool until you have identified every field you can find across all provided pages.

When calling submit_template, produce a pdfme Template object:
{
  "basePdf": { "width": 210, "height": 297, "padding": [10, 10, 10, 10] },
  "schemas": [[ ...elements... ]]
}

IMPORTANT: For every input field, you MUST also include a label element immediately before it in the schemas array. Labels are read-only text that tell the user what to fill in.

Layout rules (all measurements in millimeters, A4 page = 210 x 297):
- "schemas" is an array of pages. Each page is an array of elements: [ [page1elements...], [page2elements...], ... ]
- Include as many fields as you found — use multiple pages if required.
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

Add a title only on page 1, describing the kind of document this appears to be (e.g. "Invoice", "Application Form"):
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
    description: 'Submit the final pdfme template once every field has been identified from the document image(s).',
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

export async function runAiPdfVisionDetection(pageImages: string[]): Promise<AiPdfVisionResult> {
  const openai = getClient();

  const imageParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = pageImages.map((url) => ({
    type: 'image_url',
    image_url: { url },
  }));

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Here are the page images of the document. Identify its fields and submit the template.' },
          ...imageParts,
        ],
      },
    ],
    tools: [SUBMIT_TOOL],
  });

  const choice = completion.choices[0];
  const toolCall = choice.message.tool_calls?.find(
    (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      tc.type === 'function' && tc.function.name === 'submit_template'
  );

  if (!toolCall) {
    throw new Error(choice.message.content ?? 'The AI could not identify any fields in this document.');
  }

  const args = JSON.parse(toolCall.function.arguments) as { template: unknown };
  return { template: args.template };
}
