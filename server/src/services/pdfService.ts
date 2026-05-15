import { generate } from '@pdfme/generator';
import { getDefaultFont, type Template } from '@pdfme/common';
import {
  text, multiVariableText, image, barcodes, line, rectangle, ellipse,
  table, list, dateTime, date, time, select, checkbox, radioGroup, signature, svg,
} from '@pdfme/schemas';

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

export async function generatePdf(
  template: Template,
  inputs: Record<string, string>[],
): Promise<Buffer> {
  const pdf = await generate({
    template,
    inputs,
    options: { font: getDefaultFont() },
    plugins: getPlugins(),
  });
  return Buffer.from(pdf);
}
