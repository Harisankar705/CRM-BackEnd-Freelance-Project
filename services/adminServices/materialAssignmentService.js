const MaterialAssignment = require("../../models/materialAssignment");
const PurchaseOrderCreation = require("../../models/purchaseOrderCreation");
const ProductionOrderCreation = require("../../models/productionOrderCreation");
const FinishedGoods = require("../../models/finishedGoods");
const VendorManagement = require("../../models/vendorManagement");
const CurrentStock = require("../../models/currentStock");
const MainStock = require("../../models/mainStock");
const OutOfStock = require("../../models/outOfStock");
const RequestCreationForMaterials = require("../../models/requestCreationForMaterials");
const requestCreationForMaterials = require("../../models/requestCreationForMaterials");
let materialAssignmentService = {};
require("dotenv").config();
let adminAuthPassword = process.env.ADMIN_AUTH_PASS;

materialAssignmentService.fetchMaterialAssignment = async () => {
  try {
    const data = await MaterialAssignment.find({});

    // const materials = await CurrentStock.aggregate([
    //   {
    //     $group: {
    //       _id: "$materialName",
    //       batchNumbers: { $addToSet: "$batchNumber" },
    //     },
    //   },
    //   {
    //     $project: {
    //       materialName: "$_id",
    //       batchNumbers: 1,
    //       _id: 0,
    //     },
    //   },
    // ]);
    // const materials = await MainStock.aggregate([
    //   {
    //     $project: {
    //       materialName: 1, 
    //       materialCode: 1, 
    //       _id: 0,         
    //     },
    //   },
    // ]);


    // const requestMaterials = await RequestCreationForMaterials.aggregate([
    //   { $unwind: "$materials" },
    //   { $project: { materialsList: "$materials.materialsList", materialCode: "$materials.materialCode" } }
    // ]);

        const materials = await MainStock.aggregate([
          {
            $project: {
              materialName: 1, 
              materialCode: 1, 
              _id: 0,         
            },
          },
        ]);
    const finishedGoods = await FinishedGoods.distinct("finishedGoodsName");
    const batchNumber = await CurrentStock.distinct("batchNumber");
    const processOrderNumber = await ProductionOrderCreation.distinct(
      "processOrder"
    );
    return {
      status: 200,
      data: data,
      batchNumber: batchNumber,
      materials: materials,
      finishedGoods: finishedGoods,
      processOrderNumber: processOrderNumber,
    };
  } catch (error) {
    console.log(
      "An error occured at fetching Material Assignment in admin service",
      error.message
    );
    res.status(500).json({
      info: "An error occured in fetching Material Assignment in admin services",
    });
  }
};
materialAssignmentService.newMaterialAssignment = async (materialData) => {
  try {
    const { assignmentNumber, processOrderNumber, materials, assignedTo,indentNumber,date,finishedGoodsName } =
      materialData;


    const existingMaterialAssignment= await MaterialAssignment.findOne({
      assignmentNumber,
      });
      
      if (existingMaterialAssignment) {
        return {
          status: 409,
          message: "Assignment Number already exists",
        };
      }

    const existing = await MaterialAssignment.findOne({
      $and: [
        { assignmentNumber: assignmentNumber },
        { indentNumber: indentNumber },
        { finishedGoodsName: finishedGoodsName },
        { processOrderNumber: processOrderNumber },
        { materials: materials },
        { assignedTo: assignedTo },
      ],
    });

    for (let i = 0; i < materials.length; i++) {
      const { materialsList, assignedQuantity } = materials[i];

      const mainStock = await MainStock.findOne({
        materialName: materialsList,
      });

      const currentStock = await CurrentStock.findOne({
        materialName: materialsList,
      });


      // const requestCreationForMaterials = await requestCreationForMaterials
      if (!mainStock) {
        throw new Error(`Material ${materialsList} not found in current stock`);
      }

      let mainStockQuantity = parseFloat(mainStock.quantity.replace(/\D/g, ""));

      if (mainStockQuantity < assignedQuantity) {
        return {
          status: 409,
          message: `Insufficient stock for material: ${materialsList}`,
        };
      }

      const updatedQuantity = mainStockQuantity - assignedQuantity;
      let newAssignedQuantity;
      if (
        currentStock.quantityUsed &&
        parseFloat(currentStock.quantityUsed) >= 0
      ) {
        newAssignedQuantity =
          parseFloat(currentStock.quantityUsed) + assignedQuantity;
      } else {
        newAssignedQuantity = assignedQuantity;
      }

      const finalResult = newAssignedQuantity
        .toString()
        .split("")
        .filter((char) => !isNaN(char))
        .map(Number)
        .reduce((sum, digit) => sum + digit, 0);

      const currentStockUpdate = await CurrentStock.findOneAndUpdate(
        { materialName: materialsList },
        {
          $set: {
            quantity: `${updatedQuantity}`,
            quantityUsed: `${finalResult}`,
          },
        },
        { new: true }
      );

      const mainStockUpdate = await MainStock.findOneAndUpdate(
        { materialName: materialsList },
        {
          $set: {
            quantity: `${updatedQuantity}`,
            quantityUsed: `${assignedQuantity}`,
          },
        },
        { new: true }
      );
      if (mainStockUpdate) {
        if (updatedQuantity === 0) {
          await MainStock.deleteOne({ materialName: materialsList });
          await CurrentStock.deleteOne({ materialName: materialsList });
          const newOutOfStock = new OutOfStock({
            materialName: mainStock.materialName,
            materialCode: mainStock.materialCode,
            grn: mainStock.grn,
            price: mainStock.price,
            vendorName: mainStock.vendorName,
            storageLocation: mainStock.storageLocation,
            dateRecieved: mainStock.dateRecieved,
            expiryDate: mainStock.expiryDate,
          });

          await newOutOfStock.save();
        }
      }
    }

    if (existing) {
      return {
        status: 409,
        message: " Material Assignment already exists with the same details",
      };
    }
    let assignedAssignmentNumber = assignmentNumber;

    if (!assignmentNumber) {
      const lastOrder = await MaterialAssignment.findOne()
        .sort({ createdAt: -1 })
        .select("assignmentNumber");

      if (lastOrder && lastOrder.assignmentNumber) {
        const lastNumber = parseInt(
          lastOrder.assignmentNumber.match(/\d+$/),
          10
        );
        assignedAssignmentNumber = `FRN/AN/${(lastNumber || 0) + 1}`;
      } else {
        assignedAssignmentNumber = "FRN/AN/1";
      }
    }
    const newData = new MaterialAssignment({
      assignmentNumber: assignedAssignmentNumber,
      indentNumber,
      date,
      finishedGoodsName,
      processOrderNumber,
      materials,
      assignedTo,
    });

    await newData.save();
    return {
      status: 200,
      message: "New Material Assignment added successfully",
      data: newData,
      token: "sampleToken",
    };
  } catch (error) {
    console.log(
      "An error occured at adding new Material Assignment in admin service",
      error.message
    );
    res.status(500).json({
      info: "An error occured in adding new Material Assignment in admin services",
    });
  }
};

materialAssignmentService.editMaterialAssignment = async (
  materialAssignmentData
) => {
  try {
    const {
      authPassword,
      materialAssignmentId,
      assignmentNumber,
      indentNumber,
      date,
      finishedGoodsName,
      processOrderNumber,
      materials,
      assignedTo,
    } = materialAssignmentData;

    if (adminAuthPassword !== authPassword) {
      return {
        status: 401,
        message: "Authorization Password is Invalid",
      };
    }

    const existingMaterialAssignment= await MaterialAssignment.findOne({
      assignmentNumber,
        _id: { $ne: materialAssignmentId }, 
      });
      
      if (existingMaterialAssignment) {
        return {
          status: 409,
          message: "Assignment Number already exists",
        };
      }
    const existing = await MaterialAssignment.findOne({
      $and: [
        { assignmentNumber: assignmentNumber },
        { indentNumber: indentNumber },
        { finishedGoodsName: finishedGoodsName },
    
        { processOrderNumber: processOrderNumber },
        { materials: materials },
        { assignedTo: assignedTo },

      ],
    });

    const materialAssignmentCurrent = await MaterialAssignment.findOne({
      $and: [
        { _id: materialAssignmentId },
        { assignmentNumber: assignmentNumber },
        { indentNumber: indentNumber },
        { finishedGoodsName: finishedGoodsName },
        { processOrderNumber: processOrderNumber },
        { materials: materials },
        { assignedTo: assignedTo },
 
      ],
    });

    const existingAssignment = await MaterialAssignment.findOne({
      assignmentNumber,
    });

    if (!existingAssignment) {
      return {
        status: 404,
        message: "Material Assignment not found",
      };
    }

    for (let i = 0; i < materials.length; i++) {
      const { materialsList, assignedQuantity } = materials[i];

      const assignedQuantityValue = parseFloat(assignedQuantity);

      if (isNaN(assignedQuantityValue)) {
        throw new Error(
          `Invalid assigned quantity for material: ${materialsList}`
        );
      }

      const oldMaterial = existingAssignment.materials.find(
        (material) => material.materialsList === materialsList
      );

      const mainStock = await MainStock.findOne({
        materialName: materialsList,
      });

      if (!mainStock) {
        throw new Error(`Material ${materialsList} not found in current stock`);
      }

      let mainStockQuantity = parseFloat(mainStock.quantity.replace(/\D/g, ""));

      if (isNaN(mainStockQuantity)) {
        throw new Error(
          `Invalid quantity format for material: ${materialsList}`
        );
      }

      if (oldMaterial) {
        const oldAssignedQuantity = parseFloat(oldMaterial.assignedQuantity);
        const quantityDifference = assignedQuantityValue - oldAssignedQuantity;

        if (quantityDifference > 0) {
          if (mainStockQuantity < quantityDifference) {
            return {
              status: 409,
              message: `Insufficient stock for material: ${materialsList}`,
            };
          }
          mainStockQuantity -= quantityDifference;
        } else if (quantityDifference < 0) {
          mainStockQuantity += Math.abs(quantityDifference);
        }

        oldMaterial.assignedQuantity = assignedQuantity;
      } else {
        if (mainStockQuantity < assignedQuantityValue) {
          return {
            status: 409,
            message: `Insufficient stock for material: ${materialsList}`,
          };
        }

        mainStockQuantity -= assignedQuantityValue;

        existingAssignment.materials.push({
          materialsList,
          assignedQuantity,
        });
      }

      await CurrentStock.findOneAndUpdate(
        { materialName: materialsList },
        { quantity: `${mainStockQuantity}` },
        { new: true }
      );

      await MainStock.findOneAndUpdate(
        { materialName: materialsList },
        { quantity: `${mainStockQuantity}` },
        { new: true }
      );
    }

    await existingAssignment.save();

    let assignedAssignmentNumber = assignmentNumber;

    if (!assignmentNumber) {
      const lastOrder = await MaterialAssignment.findOne()
        .sort({ createdAt: -1 })
        .select("assignmentNumber");

      if (lastOrder && lastOrder.assignmentNumber) {
        const lastNumber = parseInt(
          lastOrder.assignmentNumber.match(/\d+$/),
          10
        );
        assignedAssignmentNumber = `FRN/AN/${(lastNumber || 0) + 1}`;
      } else {
        assignedAssignmentNumber = "FRN/AN/1";
      }
    }
    if (existing && !materialAssignmentCurrent) {
      return {
        status: 409,
        message:
          "Material assignment current already exists with the same details",
      };
    } else {
      const materialAssignmentUpdate =
        await MaterialAssignment.findByIdAndUpdate(
          materialAssignmentId,
          {
            assignmentNumber: assignedAssignmentNumber,
            processOrderNumber,
            indentNumber,
            finishedGoodsName,
            date,
            materials,
            assignedTo,
          },
          {
            new: true,
            runValidators: true,
          }
        );
    }

    return {
      status: 201,
      message: "Material Assignment Edited Successfully",
      token: "sampleToken",
    };
  } catch (error) {
    console.log(
      "An error occured at editing Material Assignment in services",
      error.message
    );
    res.status(500).json({
      info: "An error occured in Material Assignment services",
    });
  }
};

materialAssignmentService.removeMaterialAssignment = async (
  materialAssignmentId
) => {
  try {
    const materialAssignment = await MaterialAssignment.findByIdAndDelete(
      materialAssignmentId
    );

    if (!materialAssignment) {
      return {
        status: 201,
        message:
          "Material assignment not found or can't able to delete right now,Please try again later",
        token: "sampleToken",
      };
    }
    return {
      status: 201,
      message: "Material assignment deleted successfully",
      token: "sampleToken",
    };
  } catch (error) {
    console.log(
      "An error occured at material asssignment remove",
      error.message
    );
    res.status(500).json({
      info: "An error occured in material asssignment remove in gate entry services",
    });
  }
};

module.exports = materialAssignmentService;
