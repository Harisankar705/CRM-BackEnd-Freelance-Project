const FinalQualityInspection = require("../../models/finalQualityInspection");
const PurchaseOrderCreation = require("../../models/purchaseOrderCreation");
const ProductionOrderCreationOutput = require("../../models/productionOrderCreationOutput");
const FinishedGoods = require("../../models/finishedGoods");
const ProductionOrderCreation = require("../../models/productionOrderCreation");
const BillOfMaterials = require("../../models/billOfMaterials");
const MainStock = require("../../models/mainStock");
const ProcessOrder = require("../../models/processOrder");
let qualityInspectionService = {};
require("dotenv").config();
let adminAuthPassword = process.env.ADMIN_AUTH_PASS;

qualityInspectionService.fetchQualityInspection = async () => {
  try {
    const data = await FinalQualityInspection.find({});
    const productNames = await ProductionOrderCreationOutput.distinct(
      "productName"
    );
    return {
      status: 200,
      data: data,
      productNames: productNames,
    };
  } catch (error) {
    console.log(
      "An error occured at fetching Quality Inspection in admin service",
      error.message
    );
    res.status(500).json({
      info: "An error occured in fetching  Quality Inspection in admin services",
    });
  }
};

qualityInspectionService.newQualityInspection = async (inspectionData) => {
  try {
    const { inspectionNumber, productName, inspectionResults,date,batchNumber,quantity } = inspectionData;

    const existingInspectionNumber = await FinalQualityInspection.findOne({
      inspectionNumber,
        });
        
        if (existingInspectionNumber) {
          return {
            status: 409,
            message: "Inspection Number already exists",
          };
        }

        const existingBatch = await FinalQualityInspection.findOne({
          batchNumber,
            });
            
            if (existingBatch) {
              return {
                status: 409,
                message: "Batch Number already exists",
              };
            }

    const existing = await FinalQualityInspection.findOne({
      $and: [
        { inspectionNumber: inspectionNumber },
        { productName: productName },
        { inspectionResults: inspectionResults },
        { date: date },
        { batchNumber: batchNumber },
        { quantity: quantity },
      ],
    });

    let assignedInspectionNumber = inspectionNumber;

    if (!inspectionNumber) {
      const lastOrder = await FinalQualityInspection.findOne()
        .sort({ createdAt: -1 })
        .select("inspectionNumber");

      if (lastOrder && lastOrder.inspectionNumber) {
        const lastNumber = parseInt(
          lastOrder.inspectionNumber.match(/\d+$/),
          10
        );
        assignedInspectionNumber = `FRN/IN/${(lastNumber || 0) + 1}`;
      } else {
        assignedInspectionNumber = "FRN/IN/1";
      }
    }
    if (existing) {
      return {
        status: 409,
        message: " Quality Inspection already exists with the same details",
      };
    }

    if (inspectionResults === "Accepted") {
      const finishedGoodsExist = await FinishedGoods.findOne({
        finishedGoodsName: productName,
      });
      if (finishedGoodsExist) {
        return {
          status: 409,
          message: " Finished Goods already exists",
        };
      }
      const productionOrderCreation = await ProductionOrderCreation.findOne({
        productName,
      });
      if (!productionOrderCreation) {
        return {
          status: 409,
          message: "Product Not Found In Production Order Creation",
        };
      }

      const billOfMaterials = await BillOfMaterials.findOne({
        productName,
      });
      if (!billOfMaterials) {
        return {
          status: 409,
          message: "Product Not Found In Bill Of Materials",
        };
      }

      const { materials } = billOfMaterials;

      const enrichedMaterials = [];

      for (const material of materials) {
        const { materialsList, quantity,materialCode } = material;

        const mainStockData = await MainStock.findOne({
          materialName: materialsList,
        });
        if (!mainStockData) {
          return {
            status: 409,
            message: `Batch not found for material: ${materialsList}`,
          };
        }

        const vendorData = await PurchaseOrderCreation.findOne({
          materialName: materialsList,
        });
        if (!vendorData) {
          return {
            status: 409,
            message: `Vendor not found for material: ${materialsList}`,
          };
        }

        enrichedMaterials.push({
          materialsList,
          quantity,
          materialCode,
          batchNumber: mainStockData.batchNumber,
          vendorId: vendorData.vendorId,
        });
      }
      const processOrder = await ProcessOrder.findOne({
        productName
      });
      if (!processOrder) {
        return {
          status: 409,
          message: `product Name not found in process Order`,
        };
      }
      const productionOrderCreationOutput =
        await ProductionOrderCreationOutput.findOne({ productName });
      if (!productionOrderCreationOutput) {
        return {
          status: 409,
          message: `product Name not found in production Order Creation Output`,
        };
      }
      const finishedGoods = new FinishedGoods({
        finishedGoodsName: productName,
        batchNumber: productionOrderCreationOutput.batchNumberforOutput,
        productionDate: productionOrderCreationOutput.productionCompletionDate,
        plant: productionOrderCreation.plant,
        materials: enrichedMaterials,
        processOrderNo: processOrder.processOrderNumber,
        description: processOrder.description,
        storageLocation: productionOrderCreationOutput.storageLocationforOutput,
        quantityProduced: productionOrderCreationOutput.producedQuantity,
      });

      await finishedGoods.save();
    }
    const newData = new FinalQualityInspection({
      inspectionNumber: assignedInspectionNumber,
      productName,
      inspectionResults,
      date,
      batchNumber,
      quantity
    });

    await newData.save();
    return {
      status: 201,
      message: "New Quality Inspection added successfully",
      data: newData,
      token: "sampleToken",
    };
  } catch (error) {
    console.log(
      "An error occured at adding new  Quality Inspection in admin service",
      error.message
    );
    res.status(500).json({
      info: "An error occured in adding  Quality Inspection in admin services",
    });
  }
};

qualityInspectionService.editQualityInspection = async (
  qualityInpectionData
) => {
  try {
    const {
      authPassword,
      qualityInspectionId,
      inspectionNumber,
      productName,
      inspectionResults,
      date,
      batchNumber,
      quantity
    } = qualityInpectionData;

    if (adminAuthPassword !== authPassword) {
      return {
        status: 401,
        message: "Authorization Password is Invalid",
      };
    }
    const existingInspectionNumber = await FinalQualityInspection.findOne({
      inspectionNumber,
          _id: { $ne: qualityInspectionId }, 
        });
        
        if (existingInspectionNumber) {
          return {
            status: 409,
            message: "Inspection Number already exists",
          };
        }
        const existingBatchNumber = await FinalQualityInspection.findOne({
          batchNumber,
              _id: { $ne: qualityInspectionId }, 
            });
            
            if (existingBatchNumber) {
              return {
                status: 409,
                message: "Batch Number already exists",
              };
            }


    const existing = await FinalQualityInspection.findOne({
      $and: [
        { inspectionNumber: inspectionNumber },
        { productName: productName },
        { inspectionResults: inspectionResults },
        { date: date },
        { quantity: quantity },
        { batchNumber: batchNumber },
      ],
    });

    const currentQualityInspection = await FinalQualityInspection.findOne({
      $and: [
        { _id: qualityInspectionId },
        { inspectionNumber: inspectionNumber },
        { productName: productName },
        { inspectionResults: inspectionResults },
        { date: date },
        { quantity: quantity },
        { batchNumber: batchNumber },
      ],
    });
    let assignedInspectionNumber = inspectionNumber;

    if (!inspectionNumber) {
      const lastOrder = await FinalQualityInspection.findOne()
        .sort({ createdAt: -1 })
        .select("inspectionNumber");

      if (lastOrder && lastOrder.inspectionNumber) {
        const lastNumber = parseInt(
          lastOrder.inspectionNumber.match(/\d+$/),
          10
        );
        assignedInspectionNumber = `FRN/IN/${(lastNumber || 0) + 1}`;
      } else {
        assignedInspectionNumber = "FRN/IN/1";
      }
    }
    if (existing && !currentQualityInspection) {
      return {
        status: 409,
        message: "Quality Inspection already exists with the same details",
      };
    }

    const finishedGoodsExist = await FinishedGoods.findOne({
      finishedGoodsName: productName,
    });
    if (inspectionResults === "Accepted") {
      if (!finishedGoodsExist) {
        const productionOrderCreationOutput =
          await ProductionOrderCreationOutput.findOne({ productName });
        const finishedGoods = new FinishedGoods({
          finishedGoodsName: productName,
          batchNumber: productionOrderCreationOutput.batchNumberforOutput,
          productionDate:
            productionOrderCreationOutput.productionCompletionDate,
          quantityProduced: productionOrderCreationOutput.producedQuantity,
        });
        await finishedGoods.save();
      }
    } else if (inspectionResults === "Quarantine") {
      if (finishedGoodsExist) {
        await FinishedGoods.findOneAndDelete({ productName });
      }
    }
    const qualityInspectionUpdate =
      await FinalQualityInspection.findByIdAndUpdate(
        qualityInspectionId,
        {
          inspectionNumber: assignedInspectionNumber,
          productName,
          inspectionResults,
          date,
          batchNumber,
          quantity
        },
        {
          new: true,
          runValidators: true,
        }
      );
    return {
      status: 201,
      message: "Quality Inspection Edited Successfully",
      token: "sampleToken",
    };
  } catch (error) {
    console.log(
      "An error occured at editing Quality Inspection",
      error.message
    );
    res.status(500).json({
      info: "An error occured in editing Quality Inspection services",
    });
  }
};

qualityInspectionService.removeFinalQualityInspection = async (
  qualityInspectionId
) => {
  try {
    const finalQualityInspection =
      await FinalQualityInspection.findByIdAndDelete(qualityInspectionId);

    if (!finalQualityInspection) {
      return {
        status: 201,
        message:
          "Final Quality Inspection not found or can't able to delete right now,Please try again later",
        token: "sampleToken",
      };
    }
    return {
      status: 201,
      message: "Final Quality Inspection deleted successfully",
      token: "sampleToken",
    };
  } catch (error) {
    console.log(
      "An error occured at Final Quality Inspection remove",
      error.message
    );
    res.status(500).json({
      info: "An error occured in Final Quality Inspection remove in Final Quality Inspection services",
    });
  }
};

module.exports = qualityInspectionService;
