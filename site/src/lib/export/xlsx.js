// 临时探针（稍后替换为完整实现）
import ExcelJS from 'exceljs';
export async function exportXlsx() {
  const wb = new (ExcelJS.Workbook || ExcelJS.default.Workbook)();
  const ws = wb.addWorksheet('测试');
  ws.getCell('A1').value = 'hello';
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf]);
}
