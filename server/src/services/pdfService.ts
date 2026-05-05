import { generate } from '@pdfme/generator';
import { getDefaultFont, type Template } from '@pdfme/common';
import {
  text, multiVariableText, image, barcodes, line, rectangle, ellipse,
  table, list, dateTime, date, time, select, checkbox, radioGroup, signature, svg,
} from '@pdfme/schemas';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = join(__dirname, '..', '..', 'outputs');

const getPlugins = () => ({
  Text: text,
  'Multi-Variable Text': multiVariableText,
  Table: table,
  List: list,
  Line: line,
  Rectangle: rectangle,
  Ellipse: ellipse,
  Image: image,
  SVG: svg,
  Signature: signature,
  QR: barcodes.qrcode,
  DateTime: dateTime,
  Date: date,
  Time: time,
  Select: select,
  Checkbox: checkbox,
  RadioGroup: radioGroup,
  EAN13: barcodes.ean13,
  Code128: barcodes.code128,
});

export async function generateAndSavePdf(
  template: Template,
  inputs: Record<string, string>[],
): Promise<string> {
  const pdf = await generate({
    template,
    inputs,
    options: { font: getDefaultFont() },
    plugins: getPlugins(),
  });

  const filename = `${uuidv4()}.pdf`;
  const filePath = join(OUTPUTS_DIR, filename);
  await writeFile(filePath, pdf);
  return `outputs/${filename}`;
}
