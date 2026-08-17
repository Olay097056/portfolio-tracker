from app.sec_13f_service import parse_information_table, build_filing_url


def test_parse_information_table_returns_reported_holdings_without_fabricating_tickers():
    xml = """
    <informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
      <infoTable>
        <nameOfIssuer>ACME CORP</nameOfIssuer>
        <titleOfClass>COM</titleOfClass>
        <cusip>000000000</cusip>
        <value>123456</value>
        <shrsOrPrnAmt><sshPrnamt>1000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
        <investmentDiscretion>SOLE</investmentDiscretion>
      </infoTable>
    </informationTable>
    """
    rows = parse_information_table(xml, filing_period="2026-06-30")
    assert rows == [{
        "issuer": "ACME CORP",
        "cusip": "000000000",
        "title_of_class": "COM",
        "reported_value_usd": 123456000.0,
        "shares": 1000.0,
        "share_type": "SH",
        "put_call": None,
        "filing_period": "2026-06-30",
    }]


def test_build_filing_url_uses_accession_without_dashes():
    assert build_filing_url("0001067983", "0001193125-26-352200", "56757.xml") == (
        "https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/56757.xml"
    )
