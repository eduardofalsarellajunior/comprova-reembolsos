"""Converte um .xls legado em CSV UTF-8 local; não envia a planilha a serviço algum.

Instale, em um ambiente virtual local: python -m pip install xlrd==2.0.2
Uso: python scripts/converter-equipe-xls.py entrada.xls --output caminho-privado/equipe.csv
O caminho de saída precisa estar fora do repositório, não pode existir.
"""
import argparse
import csv
from pathlib import Path
import re
import sys
import unicodedata

import xlrd


def label(value):
    return " ".join(
        "".join(c for c in unicodedata.normalize("NFKD", str(value).lower()) if not unicodedata.combining(c))
        .replace("-", " ")
        .split()
    )


def cell_text(book, sheet, row, column):
    cell = sheet.cell(row, column)
    if cell.ctype == xlrd.XL_CELL_DATE:
        return xlrd.xldate_as_datetime(cell.value, book.datemode).date().isoformat()
    if cell.ctype == xlrd.XL_CELL_NUMBER and float(cell.value).is_integer():
        value = str(int(cell.value))
        xf = book.xf_list[sheet.cell_xf_index(row, column)]
        fmt = book.format_map.get(xf.format_key)
        if fmt and re.fullmatch("0{2,25}", fmt.format_str):
            value = value.zfill(len(fmt.format_str))
        return value
    return str(cell.value) if cell.value != "" else ""


def load_rows(path):
    if path.suffix.lower() != ".xls" or path.stat().st_size > 2_000_000:
        raise ValueError("Use um .xls legado de até 2 MB.")
    book = xlrd.open_workbook(str(path), on_demand=True, formatting_info=True)
    try:
        if book.nsheets != 1:
            raise ValueError("Use um .xls com apenas a aba da equipe.")
        sheet = book.sheet_by_index(0)
        if not 2 <= sheet.nrows <= 201 or not 2 <= sheet.ncols <= 50:
            raise ValueError("Use de 1 a 200 registros e até 50 colunas.")
        header = {label(v) for v in sheet.row_values(0)}
        if not header.intersection({"nome", "nome completo"}) or not header.intersection({"email", "e mail"}):
            raise ValueError("Cabeçalhos Nome e E-mail não encontrados.")
        return [
            [cell_text(book, sheet, row, col) for col in range(sheet.ncols)]
            for row in range(sheet.nrows)
        ]
    finally:
        book.release_resources()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    target = args.output.resolve()
    if target.is_relative_to(root) or target.suffix.lower() != ".csv":
        parser.error("Use uma saída .csv fora do repositório, em local privado.")
    try:
        rows = load_rows(args.input.resolve())
        with target.open("x", encoding="utf-8-sig", newline="") as stream:
            csv.writer(stream, delimiter=";").writerows(rows)
    except (ValueError, OSError, xlrd.XLRDError) as exc:
        print(f"Não foi possível converter: {type(exc).__name__}. Confira o arquivo e o destino.", file=sys.stderr)
        return 1
    print(f"Conversão concluída: {len(rows) - 1} linhas de cadastro. Trate o CSV como dado privado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
