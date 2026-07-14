import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


async function seedDelete() {
  
    await prisma.module.deleteMany({
        where:{
            files:{
                some:{
                    size: {
                        lte:2
                    }
                }
            }
        }
    })
  
    await prisma.file.deleteMany({
        where:{
            size: {
                lte: 2
            }
        }
    })

console.log('deleted seed files.');
}

seedDelete()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    return void prisma.$disconnect();
  });