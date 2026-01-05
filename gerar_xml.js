const fs = require('fs');

try {
    const rawData = fs.readFileSync('longitude_imoveis.json');
    const imoveis = JSON.parse(rawData);

    // Limpeza Nuclear
    const clean = (txt) => {
        if (!txt) return '';
        return txt.toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/[\u0800-\uFFFF]/g, '') 
            .trim();
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<listings>\n';

    imoveis.forEach(imovel => {
        if (!imovel.url) return;

        xml += '  <listing>\n';
        xml += `    <id>${clean(imovel.id)}</id>\n`;
        xml += `    <titulo>${clean(imovel.titulo)}</titulo>\n`;
        xml += `    <tipo>${clean(imovel.tipo)}</tipo>\n`;
        xml += `    <preco>0</preco>\n`;
        xml += `    <cidade>${clean(imovel.cidade)}</cidade>\n`;
        xml += `    <estado>SP</estado>\n`;
        xml += `    <bairro>${clean(imovel.bairro)}</bairro>\n`;
        xml += `    <endereco>${clean(imovel.endereco)}</endereco>\n`;
        xml += `    <status>${clean(imovel.status)}</status>\n`;
        xml += `    <url>${clean(imovel.url)}</url>\n`;
        
        let desc = clean(imovel.descricao);
        if (imovel.diferenciais.length > 0) desc += ` Diferenciais: ${imovel.diferenciais.join(', ')}.`;
        xml += `    <descricao>${desc}</descricao>\n`;
        
        if (imovel.diferenciais.length > 0) {
            xml += `    <features>${clean(imovel.diferenciais.join(','))}</features>\n`;
        }

        xml += `    <fotos>\n`;
        if (imovel.fotos.length > 0) {
            imovel.fotos.forEach(f => xml += `      <foto>${clean(f)}</foto>\n`);
        } else {
            xml += `      <foto>https://www.longitude.com.br/assets/images/logo.png</foto>\n`;
        }
        xml += `    </fotos>\n`;
        
        xml += `    <tipologias>\n`;
        xml += `      <tipologia>\n`;
        xml += `        <dormitorios>${clean(imovel.quartos)}</dormitorios>\n`;
        xml += `        <area>${clean(imovel.area)}</area>\n`;
        xml += `      </tipologia>\n`;
        xml += `    </tipologias>\n`;

        xml += '  </listing>\n';
    });

    xml += '</listings>';

    fs.writeFileSync('feed_longitude.xml', xml);
    console.log('✅ XML Longitude Gerado!');

} catch (e) { console.log('❌ Erro XML: ' + e.message); }