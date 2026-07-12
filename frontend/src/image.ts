const MAX_INPUT_BYTES=15_000_000;
const MAX_OUTPUT_BYTES=950_000;
const MAX_DIMENSION=1600;

const loadImage=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve(image);
  image.onerror=()=>reject(new Error('This image could not be opened.'));
  image.src=url;
});

const canvasBlob=(canvas:HTMLCanvasElement,type:string,quality:number)=>new Promise<Blob|null>(
  resolve=>canvas.toBlob(resolve,type,quality),
);

const blobToDataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(new Error('This image could not be read.'));
  reader.readAsDataURL(blob);
});

export async function optimizeModelPhoto(file:File){
  if(!file.type.startsWith('image/'))throw new Error('Please choose an image file.');
  if(file.size>MAX_INPUT_BYTES)throw new Error('Please choose an image smaller than 15 MB.');
  const sourceUrl=URL.createObjectURL(file);
  try{
    const image=await loadImage(sourceUrl);
    const scale=Math.min(1,MAX_DIMENSION/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Image processing is not supported by this browser.');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [0.86,0.76,0.66,0.56,0.46]){
      const blob=await canvasBlob(canvas,'image/webp',quality);
      if(blob&&blob.size<=MAX_OUTPUT_BYTES)return blobToDataUrl(blob);
    }
    throw new Error('This photo is too detailed to optimize. Please choose a smaller image.');
  }finally{URL.revokeObjectURL(sourceUrl)}
}
