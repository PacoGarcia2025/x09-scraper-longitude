const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô LONGITUDE - Versão CLOUD...');
  
  // CONFIGURAÇÃO PARA GITHUB ACTIONS
  const browser = await puppeteer.launch({ 
    headless: "new",
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });
  
  const page = await browser.newPage();
  
  // 1. LISTAGEM
  console.log('📑 Acessando listagem...');
  await page.goto('https://www.longitude.com.br/imoveis', { waitUntil: 'networkidle2', timeout: 90000 });
  
  // Scroll Infinito
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        const btn = document.querySelector('.btn-load-more'); 
        if(btn) btn.click();
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
  await new Promise(r => setTimeout(r, 2000));

  // 2. CAPTURA DE LINKS
  const linksParaVisitar = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .filter((link, index, self) => {
          return self.indexOf(link) === index && 
                 link.includes('/imoveis/') &&
                 link.split('/').length > 5 &&
                 !link.includes('facebook') && !link.includes('whatsapp');
      });
  });

  console.log(`\n📋 ${linksParaVisitar.length} imóveis na fila.`);
  const dadosDetalhados = [];
  
  // 3. VISITAS
  for (let [index, link] of linksParaVisitar.entries()) {
    console.log(`\n➡️ (${index+1}/${linksParaVisitar.length}) Visitando: ${link}`);
    
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Rola para carregar imagens
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 500;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      await new Promise(r => setTimeout(r, 1500));

      // --- EXTRAÇÃO ---
      const dadosPage = await page.evaluate((urlAtual) => {
        const dados = { url: urlAtual };
        const text = document.body.innerText;
        const html = document.body.innerHTML;

        // 1. TÍTULO E ID (Da URL para garantir precisão)
        const parts = urlAtual.split('/');
        // Pega o último pedaço (nome) e o antepenúltimo (cidade)
        const slugNome = parts[parts.length - 1] || parts[parts.length - 2];
        const slugCidade = parts[parts.length - 3] || 'SP';
        
        dados.id = 'LONG-' + slugNome.replace(/[^a-z0-9]/g, '').slice(-15).toUpperCase();
        dados.titulo = slugNome.replace(/-/g, ' ').toUpperCase();
        dados.cidade = slugCidade.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        dados.estado = 'SP';
        dados.tipo = 'Apartamento'; // Padrão Longitude

        // 2. STATUS
        dados.status = 'Em Obras';
        if (text.includes('Lançamento')) dados.status = 'Lançamento';
        if (text.includes('Pronto para morar') || text.includes('Entregue')) dados.status = 'Pronto para Morar';

        // 3. ÁREA E QUARTOS
        dados.area = '0';
        dados.quartos = '2';
        
        // Regex Area
        const matchArea = text.match(/(\d{2,3})\s*m²/);
        if (matchArea) dados.area = matchArea[1];
        
        // Regex Quartos
        const matchQ = text.match(/(\d)\s*dorm/i) || text.match(/(\d)\s*quartos/i);
        if (matchQ) dados.quartos = matchQ[1];

        // 4. BAIRRO E ENDEREÇO
        dados.endereco = 'A Consultar';
        dados.bairro = 'A Consultar';
        // Tenta pegar endereço após palavras chave
        const matchEnd = text.match(/(?:Visite|Localização|Endereço|Fica na)\s*[:]?\s*(.*?)(?:\n|\.|This)/i);
        if (matchEnd) {
            let endBruto = matchEnd[1].trim();
            if (endBruto.length > 10 && endBruto.length < 100) {
                dados.endereco = endBruto;
                // Tenta chutar o bairro (penultimo item antes da cidade)
                const partsEnd = endBruto.split(',');
                if (partsEnd.length > 1) dados.bairro = partsEnd[partsEnd.length - 2].trim();
            }
        }

        // 5. FOTOS (Filtro Matemático)
        const imgs = Array.from(document.querySelectorAll('img'));
        const fotosBoas = imgs
            .filter(img => {
                const src = (img.src || '').toLowerCase();
                // Ignora ícones pequenos (menos de 300px)
                if (img.naturalWidth > 0 && img.naturalWidth < 300) return false;
                if (src.includes('svg') || src.includes('icon') || src.includes('logo')) return false;
                if (!src.startsWith('http')) return false;
                return true;
            })
            .map(img => img.src);
            
        dados.fotos = [...new Set(fotosBoas)].slice(0, 15);

        // 6. DIFERENCIAIS
        const keywords = ['Piscina', 'Churrasqueira', 'Playground', 'Academia', 'Salão de Festas', 'Quadra', 'Pet Place'];
        dados.diferenciais = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));

        // 7. DESCRIÇÃO
        // Pega o maior parágrafo que não seja termos de uso
        const ps = Array.from(document.querySelectorAll('p'));
        const maiorP = ps.reduce((a, b) => a.innerText.length > b.innerText.length ? a : b, {innerText: ''});
        dados.descricao = maiorP.innerText.length > 50 ? maiorP.innerText : `Conheça o ${dados.titulo} em ${dados.cidade}.`;

        return dados;
      }, link);

      console.log(`   ✅ ${dadosPage.titulo} | 📐 ${dadosPage.area}m² | 📸 ${dadosPage.fotos.length} fotos`);
      dadosDetalhados.push(dadosPage);

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  fs.writeFileSync('longitude_imoveis.json', JSON.stringify(dadosDetalhados, null, 2));
  console.log(`\n💾 SUCESSO!`);
  await browser.close();
})();