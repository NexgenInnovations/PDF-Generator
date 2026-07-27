import { PDFDocument, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField } from '@pdfme/pdf-lib';
import type { PDFField, PDFPage, PDFWidgetAnnotation } from '@pdfme/pdf-lib';
import { pt2mm, type Schema } from '@pdfme/common';

function resolveWidgetPage(doc: PDFDocument, pages: PDFPage[], widget: PDFWidgetAnnotation): PDFPage | undefined {
  const pageRef = widget.P();
  if (pageRef) {
    const byRef = pages.find(p => p.ref === pageRef);
    if (byRef) return byRef;
  }
  const widgetRef = doc.context.getObjectRef(widget.dict);
  if (!widgetRef) return undefined;
  return doc.findPageForAnnotationRef(widgetRef);
}

function rectToPosition(rect: { x: number; y: number; width: number; height: number }, pageHeightPt: number) {
  return {
    position: {
      x: pt2mm(rect.x),
      y: pt2mm(pageHeightPt - rect.y - rect.height),
    },
    width: pt2mm(rect.width),
    height: pt2mm(rect.height),
  };
}

function makeUniqueName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  let suffix = 2;
  let candidate = `${name}_${suffix}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${name}_${suffix}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function mapFieldWidget(
  field: PDFField,
  widget: PDFWidgetAnnotation,
  pageHeightPt: number,
  usedNames: Set<string>,
): Schema | null {
  const fieldName = field.getName();

  try {
    const rect = widget.getRectangle();
    const { position, width, height } = rectToPosition(rect, pageHeightPt);

    if (field instanceof PDFTextField) {
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'text',
        content: field.getText() ?? '',
        position, width, height,
      };
    }
    if (field instanceof PDFCheckBox) {
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'checkbox',
        content: field.isChecked() ? 'true' : 'false',
        position, width, height,
        color: '#000000',
      };
    }
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const options = field.getOptions();
      const selected = field.getSelected();
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'select',
        content: selected[0] ?? options[0] ?? '',
        options,
        position, width, height,
      };
    }
    if (field instanceof PDFRadioGroup) {
      const selected = field.getSelected();
      const onValue = widget.getOnValue()?.decodeText();
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'radioGroup',
        group: fieldName,
        content: onValue !== undefined && onValue === selected ? 'true' : 'false',
        position, width, height,
        color: '#000000',
      };
    }
    if (field instanceof PDFSignature) {
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'signature',
        content: '',
        position, width, height,
      };
    }
  } catch (e) {
    console.warn(`[pdfFieldDetection] Skipping field "${fieldName}": ${(e as Error).message}`);
    return null;
  }
  // PDFButton and any other unrecognized field type: no pdfme equivalent.
  return null;
}

export async function detectFields(pdfBytes: ArrayBuffer): Promise<Schema[][]> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const schemas: Schema[][] = pages.map(() => []);
  const usedNamesPerPage = pages.map(() => new Set<string>());

  const fields = doc.getForm().getFields();

  for (const field of fields) {
    let widgets: PDFWidgetAnnotation[];
    try {
      widgets = field.acroField.getWidgets();
    } catch (e) {
      console.warn(`[pdfFieldDetection] Skipping field "${field.getName()}": ${(e as Error).message}`);
      continue;
    }

    for (const widget of widgets) {
      const page = resolveWidgetPage(doc, pages, widget);
      if (!page) {
        console.warn(`[pdfFieldDetection] Skipping a widget of field "${field.getName()}": could not resolve its page`);
        continue;
      }
      const pageIndex = pages.indexOf(page);
      const pageHeightPt = page.getHeight();
      const schema = mapFieldWidget(field, widget, pageHeightPt, usedNamesPerPage[pageIndex]);
      if (schema) {
        schemas[pageIndex].push(schema);
      }
    }
  }

  return schemas;
}
