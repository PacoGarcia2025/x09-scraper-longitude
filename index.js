const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô LONGITUDE - Versão BLINDADA (Capa Oficial + Links Reais)...');
  
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
      await page.evaluate(() => window.scrollBy(0, 500)); // Rola para carregar Fancybox
      await new Promise(r => setTimeout(r, 1500));

      // --- EXTRAÇÃO ---
      const dadosPage = await page.evaluate((urlAtual) => {
        const dados = { url: urlAtual };
        const text = document.body.innerText;

        // 1. TÍTULO E ID
        const parts = urlAtual.split('/');
        const slugNome = parts[parts.length - 1] || parts[parts.length - 2];
        const slugCidade = parts[parts.length - 3] || 'SP';
        
        dados.id = 'LONG-' + slugNome.replace(/[^a-z0-9]/g, '').slice(-25).toUpperCase();
        dados.titulo = slugNome.replace(/-/g, ' ').toUpperCase();
        dados.cidade = slugCidade.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        dados.estado = 'SP';
        dados.tipo = 'Apartamento';

        // 2. ENDEREÇO (Lógica do "AQUI")
        dados.endereco = 'A Consultar';
        dados.bairro = 'A Consultar';
        const strongs = Array.from(document.querySelectorAll('strong'));
        const labelAqui = strongs.find(el => el.innerText.trim().toUpperCase() === 'AQUI');

        if (labelAqui && labelAqui.nextElementSibling) {
            const spanEnd = labelAqui.nextElementSibling;
            const textoEnd = spanEnd.innerText.trim();
            const linhas = textoEnd.split(/\n/);
            if (linhas.length > 0) dados.endereco = linhas[0].trim(); 
            if (linhas.length > 1) {
                const resto = linhas[1].trim(); 
                const partesResto = resto.split(',');
                if (partesResto.length > 0) dados.bairro = partesResto[0].trim();
            }
        }

        // 3. QUARTOS (CORREÇÃO DO "12")
        dados.quartos = '2'; 
        let textoDorms = '';
        const iconeDorms = document.querySelector('.icon-dorms');
        
        if (iconeDorms && iconeDorms.parentElement) {
            textoDorms = iconeDorms.parentElement.innerText;
        } else {
            const matchQ = text.match(/(\d[\d\s,e]*)\s*dorm/i) || text.match(/(\d[\d\s,e]*)\s*quartos/i);
            if (matchQ) textoDorms = matchQ[1];
        }

        // Pega todos os números separados (Ex: "1 e 2" vira ["1", "2"])
        const numerosEncontrados = textoDorms.match(/\d+/g);
        if (numerosEncontrados && numerosEncontrados.length > 0) {
            // Pega o maior número encontrado (valoriza o imóvel)
            const maxDorms = Math.max(...numerosEncontrados.map(n => parseInt(n)));
            dados.quartos = maxDorms.toString();
        }

        // 4. VAGAS
        const iconeVaga = document.querySelector('.icon-parking');
        if (iconeVaga && iconeVaga.parentElement) {
            dados.vagas = iconeVaga.parentElement.innerText.replace(/\D/g, ''); 
        } else {
            dados.vagas = '1'; 
        }

        // 5. STATUS
        const etiquetaStatus = document.querySelector('.nav-item.bg-primary');
        if (etiquetaStatus) {
            const statusTxt = etiquetaStatus.innerText.toLowerCase();
            if (statusTxt.includes('pronto')) dados.status = 'Pronto para Morar';
            else if (statusTxt.includes('lançamento')) dados.status = 'Lançamento';
            else dados.status = 'Em Obras';
        } else {
            dados.status = 'Em Obras';
        }

        // 6. ÁREA
        dados.area = '0';
        const matchArea = text.match(/(\d{2,3})\s*m²/);
        if (matchArea) dados.area = matchArea[1];


        // 7. FOTOS (CORREÇÃO DA CAPA E LINKS QUEBRADOS)
        let fotosFinais = [];

        // A. CAPA OFICIAL (A que vai pro Facebook/Google - Melhor qualidade)
        const metaImg = document.querySelector('meta[property="og:image"]');
        if (metaImg && metaImg.content && metaImg.content.startsWith('http')) {
            fotosFinais.push(metaImg.content);
        }

        // B. GALERIA REAL (Links do Fancybox - Garantido que existem)
        // Pegamos apenas links que terminam em imagem
        const linksGaleria = Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => href.match(/\.(jpg|jpeg|png|webp)$/i))
            .filter(href => !href.includes('logo') && !href.includes('icon'));

        fotosFinais = [...fotosFinais, ...linksGaleria];

        // C. BACKUP (Se não achou nada, pega img tags grandes, sem tentar adivinhar link)
        if (fotosFinais.length < 2) {
            const imgsSoltas = Array.from(document.querySelectorAll('img'))
                .filter(img => img.naturalWidth > 400)
                .map(img => img.src);
            fotosFinais = [...fotosFinais, ...imgsSoltas];
        }

        // Limpeza: Remove duplicadas e garante ordem
        dados.fotos = [...new Set(fotosFinais)].slice(0, 20);


        // 8. DESCRIÇÃO
        const keywords = ['Piscina', 'Churrasqueira', 'Playground', 'Academia', 'Salão de Festas', 'Quadra', 'Pet Place', 'Bicicletário', 'Coworking'];
        dados.diferenciais = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
        if (dados.vagas && dados.vagas !== '0') dados.diferenciais.push(`${dados.vagas} Vaga(s)`);

        const ps = Array.from(document.querySelectorAll('p'));
        const psUteis = ps.filter(p => {
            const t = p.innerText.toLowerCase();
            return t.length > 30 && !t.includes('imagens meramente') && !t.includes('creci');
        });
        const maiorP = psUteis.reduce((a, b) => a.innerText.length > b.innerText.length ? a : b, {innerText: ''});
        dados.descricao = maiorP.innerText.length > 30 ? maiorP.innerText : `Conheça o ${dados.titulo} em ${dados.cidade}.`;

        return dados;
      }, link);

      console.log(`   ✅ ${dadosPage.titulo} | 🛏️ ${dadosPage.quartos} Dorms | 🖼️ Capa OK`);
      dadosDetalhados.push(dadosPage);

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  fs.writeFileSync('longitude_imoveis.json', JSON.stringify(dadosDetalhados, null, 2));
  console.log(`\n💾 SUCESSO!`);
  await browser.close();
})();