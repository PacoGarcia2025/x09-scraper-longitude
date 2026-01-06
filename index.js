const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô LONGITUDE - Versão FINAL (HD + CSS + Endereço)...');
  
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
      await page.evaluate(() => window.scrollBy(0, 500));
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

        // 2. ENDEREÇO (AQUI ENTRA A SUA DESCOBERTA!)
        dados.endereco = 'A Consultar';
        dados.bairro = 'A Consultar';

        // Procura a tag <strong> com texto "Aqui"
        const strongs = Array.from(document.querySelectorAll('strong'));
        const labelAqui = strongs.find(el => el.innerText.trim().toUpperCase() === 'AQUI');

        if (labelAqui && labelAqui.nextElementSibling) {
            // O endereço está no span logo depois do "Aqui"
            const spanEnd = labelAqui.nextElementSibling;
            const textoEnd = spanEnd.innerText.trim();
            
            // Geralmente vem assim: "Rua X, 123 \n Bairro Y, Cidade/UF"
            const linhas = textoEnd.split(/\n/);
            
            if (linhas.length > 0) dados.endereco = linhas[0].trim(); // Pega a Rua
            
            if (linhas.length > 1) {
                // Tenta extrair o bairro da segunda linha
                const resto = linhas[1].trim(); 
                const partesResto = resto.split(',');
                if (partesResto.length > 0) dados.bairro = partesResto[0].trim();
            }
        }

        // 3. DADOS TÉCNICOS (Ícones)
        // Quartos
        const iconeDorms = document.querySelector('.icon-dorms');
        if (iconeDorms && iconeDorms.parentElement) {
            dados.quartos = iconeDorms.parentElement.innerText.replace(/\D/g, ''); 
        } else {
            const matchQ = text.match(/(\d)\s*dorm/i) || text.match(/(\d)\s*quartos/i);
            dados.quartos = matchQ ? matchQ[1] : '2';
        }

        // Vagas
        const iconeVaga = document.querySelector('.icon-parking');
        if (iconeVaga && iconeVaga.parentElement) {
            dados.vagas = iconeVaga.parentElement.innerText.replace(/\D/g, ''); 
        } else {
            dados.vagas = '1'; 
        }

        // Status
        const etiquetaStatus = document.querySelector('.nav-item.bg-primary');
        if (etiquetaStatus) {
            const statusTxt = etiquetaStatus.innerText.toLowerCase();
            if (statusTxt.includes('pronto')) dados.status = 'Pronto para Morar';
            else if (statusTxt.includes('lançamento')) dados.status = 'Lançamento';
            else dados.status = 'Em Obras';
        } else {
            dados.status = 'Em Obras';
        }

        // Área
        dados.area = '0';
        const matchArea = text.match(/(\d{2,3})\s*m²/);
        if (matchArea) dados.area = matchArea[1];


        // 4. FOTOS (Estratégia Fancybox + Backup)
        const linksImagens = Array.from(document.querySelectorAll('a[href*=".jpg"], a[href*=".png"], a[href*=".webp"]'))
            .map(a => a.href)
            .filter(href => !href.includes('logo') && !href.includes('icon'));

        const imgsSoltas = Array.from(document.querySelectorAll('img'))
            .filter(img => img.naturalWidth > 300)
            .map(img => img.src.replace(/-thumbnail/g, '').replace(/thumbnail/g, ''));

        const todasFotos = [...linksImagens, ...imgsSoltas];
        dados.fotos = [...new Set(todasFotos)].slice(0, 20);

        // 5. DESCRIÇÃO E DIFERENCIAIS
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

      console.log(`   ✅ ${dadosPage.titulo} | 📍 ${dadosPage.endereco} (${dadosPage.bairro})`);
      dadosDetalhados.push(dadosPage);

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  fs.writeFileSync('longitude_imoveis.json', JSON.stringify(dadosDetalhados, null, 2));
  console.log(`\n💾 SUCESSO!`);
  await browser.close();
})(); 
