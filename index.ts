import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
const chromium = require('chrome-aws-lambda');

const app = express();

// Cambié el puerto para que use el valor de la variable de entorno
const port = process.env.PORT || 3000;

puppeteer.use(StealthPlugin());

// Lista de estaciones
const estaciones = [
  { name: "Centro", dataUrl: 'http://aire.nl.gob.mx:81/SIMA2017reportes/ReporteDiariosimaIcars.php?estacion1=CENTRO' },
  { name: "Sureste", dataUrl: 'http://aire.nl.gob.mx:81/SIMA2017reportes/ReporteDiariosimaIcars.php?estacion1=SURESTE' },
  // Agrega más estaciones si es necesario
];

// Función para lanzar el navegador con las opciones correctas para Vercel o local
async function launchBrowser() {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: true,
  });

  return browser;
}

// Ruta inicial
app.get('/', (req, res) => {
  res.send('API inicializada');
});

// Función para obtener datos de una estación
const obtenerDatosEstacion = async (dataUrl: string) => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto(dataUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000, // Esperar hasta que la red esté inactiva o tiempo de espera (60s)
    });

    // Esperar a que los datos sean visibles y que no contengan 'No datos'
    await page.waitForFunction(() => {
      const tbody = document.querySelector('#tablaIMK_wrapper tbody') as HTMLElement;
      return tbody && tbody.innerText.trim().length > 0 && !tbody.innerText.includes('No datos');
    });

    // Obtener los datos de la tabla
    const jsonData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#tablaIMK_wrapper tbody tr'));
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        return {
          parametro: cells[0]?.innerText.trim(),
          valor: cells[1]?.innerText.trim(),
          descriptor: cells[2]?.innerText.trim(),
        };
      });
    });

    return jsonData;
  } catch (error) {
    console.error('Error al obtener los datos de la estación:', error);
    throw new Error('Error al procesar la solicitud para la estación');
  } finally {
    await browser.close();
  }
};

// Crear rutas específicas para cada estación
estaciones.forEach(estacion => {
  app.get(`/data/${estacion.name.toLowerCase()}`, async (req, res) => {
    try {
      const jsonData = await obtenerDatosEstacion(estacion.dataUrl);
      res.json(jsonData);
    } catch (error) {
      console.error(`Error al cargar los datos de ${estacion.name}:`, error);
      res.status(500).send(`Error al procesar la solicitud para ${estacion.name}`);
    }
  });
});

// Iniciar el servidor en el puerto correcto
app.listen(port, () => {
  console.log(`API inicializada en http://localhost:${port}`);
});
